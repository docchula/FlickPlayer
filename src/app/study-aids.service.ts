import {inject, Injectable} from '@angular/core';
import {HttpErrorResponse} from '@angular/common/http';
import {BehaviorSubject, defer, Observable, of, Subscription, throwError} from 'rxjs';
import {catchError, map, shareReplay, tap} from 'rxjs/operators';
import {ManService} from './man.service';
import {
    ANSWER,
    CHANGE_DISPLAY_NAME,
    DISPLAY_NAME_QUERY,
    EDITORS,
    GRANT_ROLE,
    Operation,
    QUIZ_REVISIONS,
    REMOVE_ROLE,
    SAVE_QUIZ,
    SAVE_SUMMARY,
    SAVE_TICKS,
    STUDY_AIDS,
    SUMMARY_REVISIONS,
    TRANSCRIPT,
    VERIFY_QUIZ,
    VERIFY_SUMMARY,
} from './study-aids/operations';
import {
    isObject,
    parseEditor,
    parseEditors,
    parseErrors,
    parseProfile,
    parseQuiz,
    parseQuizRevisions,
    parseStats,
    parseStudyAids,
    parseSummary,
    parseSummaryRevisions,
    parseTranscript,
    text,
} from './study-aids/parse';
import {
    AnswerStats,
    EditorProfile,
    EditorRole,
    PartName,
    QuizChange,
    QuizPart,
    QuizQuestion,
    QuizRevision,
    SaveFailure,
    StudyAids,
    StudyAidsEditor,
    StudyAidsState,
    SummaryChange,
    SummaryPart,
    SummaryRevision,
    TranscriptState,
} from './study-aids/study-aids.model';

/** A lecture's study aids are fetched again when a card shows them after this long. */
const FRESH_FOR_MS = 5 * 60 * 1000;
/** Earlier versions are large and only fetched when a reader asks for them, so few are kept. */
const KEPT_HISTORIES = 4;
/** A transcript can be long, and FlickMan only lets a reader fetch a few an hour. */
const KEPT_TRANSCRIPTS = 6;

interface Entry {
    state: BehaviorSubject<StudyAidsState>;
    fetchedAt: number;
    request: Subscription | null;
}

type Fields = Record<string, unknown>;

interface Reply {
    data?: Fields | null;
    errors?: unknown[];
}

/** What can go wrong: what the editors are told, or a FlickMan that has no study aids at all. */
type Failure = SaveFailure | {kind: 'unsupported'};

const UNEXPECTED: SaveFailure = {kind: 'failed', message: 'FlickMan sent back something unexpected.'};

function isFailure(value: unknown): value is Failure {
    return isObject(value) && typeof value['kind'] === 'string';
}

/** The value at a path through an answer, such as `video`, `transcript`. */
function at(data: unknown, ...keys: string[]): unknown {
    return keys.reduce<unknown>((value, key) => isObject(value) ? value[key] : null, data);
}

/** FlickMan's GraphQL errors in the terms the editors need. Validation messages keep the argument paths as fields. */
function graphqlFailure(errors: unknown[]): Failure {
    const entries = errors.filter(isObject);
    const validation: Record<string, string[]> = {};
    for (const entry of entries) {
        Object.assign(validation, parseErrors(at(entry, 'extensions', 'validation')));
    }
    const messages = Object.values(validation).flat();
    if (messages.length) {
        return {kind: 'invalid', message: messages[0], errors: validation};
    }
    const message = text(entries[0]?.['message']) ?? '';
    if (at(entries[0], 'extensions', 'category') === 'authorization' || message === 'This action is unauthorized.') {
        return {kind: 'forbidden'};
    }
    if (/^Rate limit for .+ exceeded/.test(message)) {
        return {kind: 'rate-limited'};
    }
    // A FlickMan without study aids does not know their fields.
    if (/^Cannot query field/.test(message)) {
        return {kind: 'unsupported'};
    }

    return {kind: 'failed', message: message || 'FlickMan could not do that.'};
}

function failureOf(error: unknown): Failure {
    if (isFailure(error)) {
        return error;
    }
    if (!(error instanceof HttpErrorResponse) || error.status === 0) {
        return {kind: 'network'};
    }
    const errors = at(error.error, 'errors');
    if (Array.isArray(errors) && errors.length) {
        return graphqlFailure(errors);
    }
    switch (error.status) {
        case 401:
        case 403:
            return {kind: 'forbidden'};
        case 429:
            return {kind: 'rate-limited'};
        default:
            return {kind: 'failed', message: `FlickMan answered with error ${error.status}.`};
    }
}

function forEditors(failure: Failure): SaveFailure {
    return failure.kind === 'unsupported' ? {kind: 'failed', message: 'This server has no study aids yet.'} : failure;
}

/**
 * The AI summary, quiz and transcript FlickMan keeps for each lecture, through its GraphQL API.
 * The tabs share one request per lecture, and an edit or an answer updates what they show without
 * fetching again.
 */
@Injectable({
    providedIn: 'root',
})
export class StudyAidsService {
    private man = inject(ManService);

    private readonly entries = new Map<number, Entry>();
    private readonly histories = new Map<string, Observable<unknown>>();
    private readonly transcripts = new Map<number, BehaviorSubject<TranscriptState>>();
    private readonly profileState = new BehaviorSubject<EditorProfile | null>(null);
    private profileRequest: Subscription | null = null;
    /** Whether FlickMan has answered for good: with the editor's name, or that this reader is not an editor. */
    private profileKnown = false;
    /** Turned off for the visit once FlickMan turns out to have no study aids at all. */
    private supported = true;

    watch(videoId: number): Observable<StudyAidsState> {
        const entry = this.entry(videoId);
        const status = entry.state.value.status;
        if (!this.busy(entry) && (status === 'error' || Date.now() - entry.fetchedAt > FRESH_FOR_MS)) {
            this.fetch(videoId, entry);
        }

        return entry.state.asObservable();
    }

    refresh(videoId: number): void {
        this.fetch(videoId, this.entry(videoId));
    }

    saveSummary(videoId: number, change: SummaryChange): Observable<SummaryPart> {
        return this.savePart(videoId, 'summary', SAVE_SUMMARY, 'saveStudySummary', {
            video_id: String(videoId),
            markdown: change.markdown,
            revision: change.revision,
            credit: change.credit,
        }, parseSummary, (aids, summary) => ({...aids, summary}));
    }

    saveQuiz(videoId: number, change: QuizChange): Observable<QuizPart> {
        return this.savePart(videoId, 'quiz', SAVE_QUIZ, 'saveStudyQuiz', {
            video_id: String(videoId),
            questions: change.questions,
            revision: change.revision,
            credit: change.credit,
        }, parseQuiz, (aids, quiz) => ({...aids, quiz}));
    }

    /** Marks the version an editor has checked against the lecture, or takes their mark back. */
    verify(videoId: number, part: PartName, revision: number, verified: boolean): Observable<SummaryPart | QuizPart> {
        const variables = {video_id: String(videoId), revision, verified};

        return part === 'summary'
            ? this.savePart(videoId, 'summary', VERIFY_SUMMARY, 'verifyStudySummary', variables, parseSummary, (aids, summary) => ({...aids, summary}))
            : this.savePart(videoId, 'quiz', VERIFY_QUIZ, 'verifyStudyQuiz', variables, parseQuiz, (aids, quiz) => ({...aids, quiz}));
    }

    /** Every saved version of the summary, oldest first. `revision` is the one on show, so a newer one is fetched afresh. */
    summaryRevisions(videoId: number, revision: number): Observable<SummaryRevision[]> {
        return this.history(videoId, 'summary', revision, SUMMARY_REVISIONS, parseSummaryRevisions);
    }

    quizRevisions(videoId: number, revision: number): Observable<QuizRevision[]> {
        return this.history(videoId, 'quiz', revision, QUIZ_REVISIONS, parseQuizRevisions);
    }

    /** The AI's word-for-word transcript, fetched once a visit; a failure is only tried again on request. */
    transcript(videoId: number): Observable<TranscriptState> {
        let subject = this.transcripts.get(videoId);
        if (!subject) {
            subject = new BehaviorSubject<TranscriptState>({status: 'loading'});
            this.transcripts.set(videoId, subject);
            this.fetchTranscript(videoId, subject);
            for (const old of [...this.transcripts.keys()].slice(0, -KEPT_TRANSCRIPTS)) {
                this.transcripts.delete(old);
            }
        }

        return subject.asObservable();
    }

    retryTranscript(videoId: number): void {
        const subject = this.transcripts.get(videoId);
        if (subject?.value.status === 'error') {
            subject.next({status: 'loading'});
            this.fetchTranscript(videoId, subject);
        }
    }

    /** This editor's display name; null for readers who are not editors, and until it arrives. */
    profile(): Observable<EditorProfile | null> {
        if (!this.profileKnown && (!this.profileRequest || this.profileRequest.closed)) {
            this.profileRequest = this.run(DISPLAY_NAME_QUERY).subscribe({
                next: data => {
                    this.profileKnown = true;
                    this.profileState.next(parseProfile(data['studyAidDisplayName']));
                },
                error: (failure: Failure) => {
                    // Anything but "not an editor" is asked about again next time.
                    this.profileKnown = failure.kind === 'forbidden' || failure.kind === 'unsupported';
                },
            });
        }

        return this.profileState.asObservable();
    }

    /** Changes the name students see, which FlickMan allows once every 30 days. */
    saveProfile(name: string): Observable<EditorProfile> {
        return this.editorCall(this.run(CHANGE_DISPLAY_NAME, {name}), data => parseProfile(data['changeStudyAidDisplayName'])).pipe(
            tap(profile => {
                this.profileKnown = true;
                this.profileState.next(profile);
                // Bylines and verifications show the new name.
                for (const [videoId, entry] of this.entries) {
                    entry.fetchedAt = 0;
                    if (entry.state.observed) {
                        this.fetch(videoId, entry);
                    }
                }
                this.histories.clear();
            }),
        );
    }

    /** Adds an answer to the class stats. Only a reader's first answer to a question counts. */
    answer(videoId: number, questionId: string, choice: number): Observable<AnswerStats | null> {
        return this.run(ANSWER, {video_id: String(videoId), question_id: questionId, choice}).pipe(
            map(data => {
                const stats = parseStats(data['answerStudyQuestion']);
                if (!stats) {
                    // The question was removed or replaced since the quiz was loaded.
                    this.refresh(videoId);
                }

                return stats;
            }),
            tap(stats => this.updateQuestion(videoId, questionId, question => ({
                ...question,
                stats: stats ?? question.stats,
                mine: question.mine ?? choice,
            }))),
            catchError(() => of(null)),
        );
    }

    /** Keeps the summary points this reader has ticked on FlickMan, so their other devices show them too. */
    saveTicks(videoId: number, ticks: string[]): Observable<string[]> {
        return this.editorCall(this.run(SAVE_TICKS, {video_id: String(videoId), ticks}), data => {
            const saved = data['saveStudyTicks'];

            return Array.isArray(saved) ? saved.filter((key): key is string => typeof key === 'string') : null;
        });
    }

    /** Everyone allowed to edit study aids. Admins only. */
    editors(): Observable<StudyAidsEditor[]> {
        return this.editorCall(this.run(EDITORS), data => parseEditors({editors: data['studyAidEditors']}));
    }

    /** Adds an editor, or changes their role. Admins only. */
    saveEditor(email: string, role: EditorRole): Observable<StudyAidsEditor> {
        return this.editorCall(this.run(GRANT_ROLE, {email, role}), data => parseEditor(data['grantStudyAidRole']));
    }

    removeEditor(email: string): Observable<true> {
        return this.editorCall(this.run(REMOVE_ROLE, {email}), () => true);
    }

    private run(operation: Operation, variables: object = {}): Observable<Fields> {
        return this.send(this.man.post<Reply>('graphql', {operationName: operation.name, query: operation.query, variables}));
    }

    /** The answer's data, or a Failure when FlickMan reports errors or cannot be reached. */
    private send(request: Observable<Reply | null>): Observable<Fields> {
        return request.pipe(
            map(reply => {
                if (!reply) {
                    throw {kind: 'network'} satisfies Failure;
                }
                if (Array.isArray(reply.errors) && reply.errors.length) {
                    throw graphqlFailure(reply.errors);
                }
                if (!isObject(reply.data)) {
                    throw UNEXPECTED;
                }

                return reply.data;
            }),
            catchError((error: unknown) => throwError(() => failureOf(error))),
        );
    }

    private editorCall<T>(request: Observable<Fields>, parse: (data: Fields) => T | null): Observable<T> {
        return request.pipe(
            map(data => {
                const result = parse(data);
                if (result === null) {
                    throw UNEXPECTED;
                }

                return result;
            }),
            catchError((error: unknown) => throwError(() => forEditors(failureOf(error)))),
        );
    }

    /** A save or a verification. FlickMan answers with what became of it and the part as it now stands. */
    private savePart<P extends SummaryPart | QuizPart>(
        videoId: number,
        name: PartName,
        operation: Operation,
        field: string,
        variables: object,
        parse: (value: unknown) => P | null,
        apply: (aids: StudyAids, saved: P) => StudyAids,
    ): Observable<P> {
        return this.run(operation, variables).pipe(
            map(data => {
                const outcome = at(data, field, 'outcome');
                const part = parse(at(data, field, name));
                if ((outcome === 'saved' || outcome === 'unchanged') && part) {
                    return part;
                }
                if (outcome === 'conflict') {
                    throw {kind: 'conflict', current: part} satisfies SaveFailure;
                }
                if (outcome === 'missing') {
                    this.refresh(videoId);
                    throw {kind: 'failed', message: `This lecture has no ${name} yet.`} satisfies SaveFailure;
                }
                throw UNEXPECTED;
            }),
            tap(saved => this.update(videoId, aids => apply(aids, saved))),
            catchError((error: unknown) => {
                const failure = forEditors(failureOf(error));
                if (failure.kind === 'conflict' && failure.current) {
                    // Show everyone's latest version behind the editor straight away.
                    this.update(videoId, aids => apply(aids, failure.current as P));
                } else if (failure.kind === 'forbidden') {
                    this.refresh(videoId);
                }

                return throwError(() => failure);
            }),
        );
    }

    private history<T>(videoId: number, name: PartName, revision: number, operation: Operation, parse: (value: unknown) => T[] | null): Observable<T[]> {
        const key = `${videoId}/${name}/${revision}`;
        let cached = this.histories.get(key) as Observable<T[]> | undefined;
        if (!cached) {
            // A failed request is not kept, so asking again sends a new one.
            cached = this.editorCall(defer(() => this.run(operation, {id: String(videoId)})), data => {
                const revisions = at(data, 'video', 'studyAids', name, 'revisions');

                return parse({revisions: Array.isArray(revisions) ? revisions : []});
            }).pipe(shareReplay(1));
            this.histories.set(key, cached);
            for (const old of [...this.histories.keys()].slice(0, -KEPT_HISTORIES)) {
                this.histories.delete(old);
            }
        }

        return cached;
    }

    private fetchTranscript(videoId: number, subject: BehaviorSubject<TranscriptState>): void {
        this.run(TRANSCRIPT, {id: String(videoId)}).subscribe({
            next: data => {
                const paragraphs = parseTranscript(at(data, 'video', 'transcript'));
                subject.next(paragraphs?.length ? {status: 'ready', paragraphs} : {status: 'none'});
            },
            error: (failure: Failure) => subject.next(failure.kind === 'forbidden' || failure.kind === 'unsupported'
                ? {status: 'none'}
                : {status: 'error', limited: failure.kind === 'rate-limited'}),
        });
    }

    private fetch(videoId: number, entry: Entry): void {
        entry.request?.unsubscribe();
        if (!this.supported) {
            entry.state.next({status: 'unavailable'});

            return;
        }
        if (entry.state.value.status !== 'ready') {
            entry.state.next({status: 'loading'});
        }
        entry.request = this.run(STUDY_AIDS, {id: String(videoId)}).subscribe({
            next: data => {
                const video = at(data, 'video');
                // A lecture FlickMan does not have, or does not show this reader, comes back as null.
                const aids = isObject(video) && isObject(video['studyAids'])
                    ? parseStudyAids({...video['studyAids'], has_transcript: video['has_transcript']})
                    : null;
                entry.fetchedAt = Date.now();
                entry.state.next(aids ? {status: 'ready', aids} : {status: 'unavailable'});
            },
            error: (failure: Failure) => {
                if (failure.kind === 'unsupported') {
                    this.supported = false;
                }
                const status = failure.kind === 'unsupported' || failure.kind === 'forbidden' ? 'unavailable' : 'error';
                entry.fetchedAt = Date.now();
                // A failed refresh keeps what the tabs already show.
                if (status === 'unavailable' || entry.state.value.status !== 'ready') {
                    entry.state.next({status});
                }
            },
        });
    }

    private update(videoId: number, change: (aids: StudyAids) => StudyAids): void {
        const entry = this.entries.get(videoId);
        const state = entry?.state.value;
        if (entry && state?.status === 'ready') {
            entry.state.next({status: 'ready', aids: change(state.aids)});
        }
    }

    private updateQuestion(videoId: number, questionId: string, change: (question: QuizQuestion) => QuizQuestion): void {
        this.update(videoId, aids => aids.quiz ? {
            ...aids,
            quiz: {...aids.quiz, questions: aids.quiz.questions.map(question => question.id === questionId ? change(question) : question)},
        } : aids);
    }

    private busy(entry: Entry): boolean {
        return !!entry.request && !entry.request.closed;
    }

    private entry(videoId: number): Entry {
        let entry = this.entries.get(videoId);
        if (!entry) {
            entry = {state: new BehaviorSubject<StudyAidsState>({status: 'loading'}), fetchedAt: 0, request: null};
            this.entries.set(videoId, entry);
        }

        return entry;
    }
}
