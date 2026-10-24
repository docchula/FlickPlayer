import {inject, Injectable} from '@angular/core';
import {HttpErrorResponse} from '@angular/common/http';
import {BehaviorSubject, Observable, of, Subscription, throwError} from 'rxjs';
import {catchError, map, tap} from 'rxjs/operators';
import {ManService} from './man.service';
import {ANSWER, Operation, SAVE_TICKS, STUDY_AIDS, TRANSCRIPT} from './study-aids/operations';
import {isObject, parseStats, parseStudyAids, parseTranscript, text} from './study-aids/parse';
import {AnswerStats, QuizQuestion, StudyAids, StudyAidsState, TranscriptState} from './study-aids/study-aids.model';

/** A lecture's study aids are fetched again when a card shows them after this long. */
const FRESH_FOR_MS = 5 * 60 * 1000;
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

/** What can go wrong, including a FlickMan that has no study aids at all. */
type Failure = {kind: 'forbidden' | 'rate-limited' | 'network' | 'unsupported' | 'failed'};

const UNEXPECTED: Failure = {kind: 'failed'};

function isFailure(value: unknown): value is Failure {
    return isObject(value) && typeof value['kind'] === 'string';
}

/** The value at a path through an answer, such as `video`, `transcript`. */
function at(data: unknown, ...keys: string[]): unknown {
    return keys.reduce<unknown>((value, key) => isObject(value) ? value[key] : null, data);
}

function graphqlFailure(errors: unknown[]): Failure {
    const first = errors.find(isObject);
    const message = text(first?.['message']) ?? '';
    if (at(first, 'extensions', 'category') === 'authorization' || message === 'This action is unauthorized.') {
        return {kind: 'forbidden'};
    }
    if (/^Rate limit for .+ exceeded/.test(message)) {
        return {kind: 'rate-limited'};
    }
    // A FlickMan without study aids does not know their fields.
    if (/^Cannot query field/.test(message)) {
        return {kind: 'unsupported'};
    }

    return UNEXPECTED;
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
            return UNEXPECTED;
    }
}

/**
 * The AI summary, quiz and transcript FlickMan keeps for each lecture, through its GraphQL API.
 * The tabs share one request per lecture, and an answer updates what they show without fetching again.
 */
@Injectable({
    providedIn: 'root',
})
export class StudyAidsService {
    private man = inject(ManService);

    private readonly entries = new Map<number, Entry>();
    private readonly transcripts = new Map<number, BehaviorSubject<TranscriptState>>();
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

    /** Adds an answer to the class stats. Only a reader's first answer to a question counts. */
    answer(videoId: number, questionId: string, choice: number): Observable<AnswerStats | null> {
        return this.run(ANSWER, {video_id: String(videoId), question_id: questionId, choice}).pipe(
            map(data => {
                const stats = parseStats(data['answerStudyQuestion']);
                if (!stats) {
                    // The AI wrote a new quiz since this one was loaded.
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
        return this.run(SAVE_TICKS, {video_id: String(videoId), ticks}).pipe(
            map(data => {
                const saved = data['saveStudyTicks'];
                if (!Array.isArray(saved)) {
                    throw UNEXPECTED;
                }

                return saved.filter((key): key is string => typeof key === 'string');
            }),
        );
    }

    /** The answer's data, or a Failure when FlickMan reports errors or cannot be reached. */
    private run(operation: Operation, variables: object): Observable<Fields> {
        return this.man.post<Reply>('graphql', {operationName: operation.name, query: operation.query, variables}).pipe(
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
