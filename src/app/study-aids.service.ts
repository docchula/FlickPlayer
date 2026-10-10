import {inject, Injectable} from '@angular/core';
import {HttpErrorResponse} from '@angular/common/http';
import {BehaviorSubject, defer, Observable, of, Subscription, throwError} from 'rxjs';
import {catchError, map, shareReplay, tap} from 'rxjs/operators';
import {JSend, ManService} from './man.service';
import {
    isObject,
    parseEditor,
    parseEditors,
    parseErrors,
    parseImage,
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
    UploadedImage,
} from './study-aids/study-aids.model';

/** A lecture's study aids are fetched again when a card shows them after this long. */
const FRESH_FOR_MS = 5 * 60 * 1000;

interface Entry {
    state: BehaviorSubject<StudyAidsState>;
    fetchedAt: number;
    request: Subscription | null;
}

/** Earlier versions are large and only fetched when a reader asks for them, so few are kept. */
const KEPT_HISTORIES = 4;
/** A transcript can be long, and FlickMan only lets a reader fetch a few an hour. */
const KEPT_TRANSCRIPTS = 6;

const EDITORS_PATH = 'v1/study_aids/editors';
const PROFILE_PATH = 'v1/study_aids/me';

function path(videoId: number): string {
    return 'v1/study_aids/' + videoId;
}

function isSaveFailure(value: unknown): value is SaveFailure {
    return isObject(value) && typeof value['kind'] === 'string';
}

/**
 * The AI summary and quiz FlickMan keeps for each lecture. Both cards share one request per
 * lecture, and an edit or an answer updates what they show without fetching again.
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
        return this.save(videoId, '/summary', change, parseSummary, (aids, summary) => ({...aids, summary}));
    }

    saveQuiz(videoId: number, change: QuizChange): Observable<QuizPart> {
        return this.save(videoId, '/quiz', change, parseQuiz, (aids, quiz) => ({...aids, quiz}));
    }

    /** Marks the version an editor has checked against the lecture, or takes their mark back. */
    verify(videoId: number, part: PartName, revision: number, verified: boolean): Observable<SummaryPart | QuizPart> {
        const body = {revision, verified};

        return part === 'summary'
            ? this.save(videoId, '/summary/verify', body, parseSummary, (aids, summary) => ({...aids, summary}))
            : this.save(videoId, '/quiz/verify', body, parseQuiz, (aids, quiz) => ({...aids, quiz}));
    }

    /** Every saved version of the summary, oldest first. `revision` is the one on show, so a newer one is fetched afresh. */
    summaryRevisions(videoId: number, revision: number): Observable<SummaryRevision[]> {
        return this.history(videoId, 'summary', revision, parseSummaryRevisions);
    }

    quizRevisions(videoId: number, revision: number): Observable<QuizRevision[]> {
        return this.history(videoId, 'quiz', revision, parseQuizRevisions);
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
            this.profileRequest = this.man.get<JSend<unknown>>(PROFILE_PATH).subscribe({
                next: response => {
                    this.profileKnown = !!response;
                    this.profileState.next(parseProfile(response?.data));
                },
                error: (error: unknown) => {
                    // Anything but "not an editor" is asked about again next time.
                    this.profileKnown = error instanceof HttpErrorResponse && [401, 403, 404].includes(error.status);
                },
            });
        }

        return this.profileState.asObservable();
    }

    /** Changes the name students see, which FlickMan allows once every 30 days. */
    saveProfile(name: string): Observable<EditorProfile> {
        return this.send(this.man.post<JSend<unknown>>(PROFILE_PATH, {name}), parseProfile).pipe(
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
        return this.man.post<JSend<unknown>>(path(videoId) + '/answers', {question_id: questionId, choice}).pipe(
            map(response => parseStats(response?.data)),
            tap(stats => this.updateQuestion(videoId, questionId, question => ({
                ...question,
                stats: stats ?? question.stats,
                mine: question.mine ?? choice,
            }))),
            catchError((error: unknown) => {
                // The question was removed or replaced since the quiz was loaded.
                if (error instanceof HttpErrorResponse && error.status === 404) {
                    this.refresh(videoId);
                }

                return of(null);
            }),
        );
    }

    /** Everyone allowed to edit study aids. Admins only. */
    editors(): Observable<StudyAidsEditor[]> {
        return this.send(this.man.get<JSend<unknown>>(EDITORS_PATH), parseEditors);
    }

    /** Adds an editor, or changes their role. Admins only. */
    saveEditor(email: string, role: EditorRole): Observable<StudyAidsEditor> {
        return this.send(this.man.post<JSend<unknown>>(EDITORS_PATH, {email, role}), parseEditor);
    }

    removeEditor(email: string): Observable<true> {
        return this.send(this.man.post<JSend<unknown>>(EDITORS_PATH + '/remove', {email}), () => true);
    }

    /** Stores an image on FlickMan and returns the address to write into the Markdown. */
    uploadImage(videoId: number, image: Blob, fileName: string): Observable<UploadedImage> {
        const form = new FormData();
        form.append('image', image, fileName);

        return this.send(this.man.post<JSend<unknown>>(path(videoId) + '/images', form), parseImage);
    }

    private send<T>(request: Observable<JSend<unknown> | null>, parse: (value: unknown) => T | null): Observable<T> {
        return request.pipe(
            map(response => {
                if (!response) {
                    throw {kind: 'network'} satisfies SaveFailure;
                }
                const result = parse(response.data);
                if (result === null) {
                    throw {kind: 'failed', message: 'FlickMan sent back something unexpected.'} satisfies SaveFailure;
                }

                return result;
            }),
            catchError((error: unknown) => throwError(() => this.saveFailure(error, () => null))),
        );
    }

    private history<T>(videoId: number, part: PartName, revision: number, parse: (value: unknown) => T[] | null): Observable<T[]> {
        const key = `${videoId}/${part}/${revision}`;
        let cached = this.histories.get(key) as Observable<T[]> | undefined;
        if (!cached) {
            // A failed request is not kept, so asking again sends a new one.
            cached = this.send(defer(() => this.man.get<JSend<unknown>>(`${path(videoId)}/${part}/revisions`)), parse).pipe(shareReplay(1));
            this.histories.set(key, cached);
            for (const old of [...this.histories.keys()].slice(0, -KEPT_HISTORIES)) {
                this.histories.delete(old);
            }
        }

        return cached;
    }

    private fetchTranscript(videoId: number, subject: BehaviorSubject<TranscriptState>): void {
        this.man.get<JSend<unknown>>(path(videoId) + '/transcript').subscribe({
            next: response => {
                const paragraphs = parseTranscript(response?.data);
                subject.next(paragraphs?.length ? {status: 'ready', paragraphs} : response ? {status: 'none'} : {status: 'error', limited: false});
            },
            error: (error: unknown) => {
                const status = error instanceof HttpErrorResponse ? error.status : 0;
                subject.next([401, 403, 404].includes(status) ? {status: 'none'} : {status: 'error', limited: status === 429});
            },
        });
    }

    private save<P extends SummaryPart | QuizPart>(
        videoId: number,
        part: string,
        change: SummaryChange | QuizChange | {revision: number; verified: boolean},
        parse: (value: unknown) => P | null,
        apply: (aids: StudyAids, saved: P) => StudyAids,
    ): Observable<P> {
        return this.man.post<JSend<unknown>>(path(videoId) + part, change).pipe(
            map(response => {
                const saved = parse(response?.data);
                if (!saved) {
                    throw (response
                        ? {kind: 'failed', message: 'FlickMan sent back something unexpected.'}
                        : {kind: 'network'}) satisfies SaveFailure;
                }

                return saved;
            }),
            tap(saved => this.update(videoId, aids => apply(aids, saved))),
            catchError((error: unknown) => {
                const failure = this.saveFailure(error, parse);
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

    private saveFailure(error: unknown, parse: (value: unknown) => SummaryPart | QuizPart | null): SaveFailure {
        if (isSaveFailure(error)) {
            return error;
        }
        if (!(error instanceof HttpErrorResponse) || error.status === 0) {
            return {kind: 'network'};
        }
        const body = isObject(error.error) ? error.error : {};
        switch (error.status) {
            case 409:
                return {kind: 'conflict', current: parse(body['data'])};
            case 422:
                return {kind: 'invalid', message: text(body['message']) ?? 'FlickMan did not accept the change.', errors: parseErrors(body['errors'])};
            case 401:
            case 403:
                return {kind: 'forbidden'};
            case 429:
                return {kind: 'rate-limited'};
            default:
                return {kind: 'failed', message: text(body['message']) ?? `FlickMan answered with error ${error.status}.`};
        }
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
        entry.request = this.man.get<JSend<unknown>>(path(videoId)).subscribe({
            next: response => {
                const aids = parseStudyAids(response?.data);
                entry.fetchedAt = Date.now();
                entry.state.next(aids ? {status: 'ready', aids} : {status: response ? 'unavailable' : 'error'});
            },
            error: (error: unknown) => {
                const status = this.errorState(error);
                entry.fetchedAt = Date.now();
                // A failed refresh keeps what the cards already show.
                if (status === 'unavailable' || entry.state.value.status !== 'ready') {
                    entry.state.next({status});
                }
            },
        });
    }

    private errorState(error: unknown): 'unavailable' | 'error' {
        if (!(error instanceof HttpErrorResponse)) {
            return 'error';
        }
        if (error.status === 404) {
            // FlickMan says a lecture is missing in JSend; any other 404 means it has no study aids routes.
            if (!isObject(error.error) || error.error['status'] !== 'error') {
                this.supported = false;
            }

            return 'unavailable';
        }

        return error.status === 401 || error.status === 403 ? 'unavailable' : 'error';
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
