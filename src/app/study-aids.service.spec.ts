import {TestBed} from '@angular/core/testing';
import {HttpErrorResponse} from '@angular/common/http';
import {Observable, of, throwError} from 'rxjs';
import {ManService} from './man.service';
import {StudyAidsService} from './study-aids.service';
import {StudyAidsState, TranscriptState} from './study-aids/study-aids.model';

const SUMMARY = {markdown: '## Nucleus [00:01:10]\n\n1. **Barr body** : X − 1'};

const QUESTION = {
    id: '01M4D7B2STKMV08W6Z0ZF3G56N',
    prompt: 'เซลล์ชนิดใดมี smooth ER มากที่สุด',
    choices: ['Plasma cell', 'Pancreatic acinar cell', 'Leydig cell', 'Neutrophil', 'Mature red blood cell'],
    answer: 2,
    explanation: null,
    time: 465,
    stats: {answered: 12, correct: 10},
    mine: null,
};

const QUIZ = {questions: [QUESTION]};

interface Body {
    operationName: string;
    query: string;
    variables: Record<string, unknown>;
}

type Handler = (variables: Record<string, unknown>) => Observable<unknown>;

function data(value: object): Observable<unknown> {
    return of({data: value});
}

function graphqlError(message: string, extensions: object = {}): Observable<unknown> {
    return of({errors: [{message, extensions}], data: null});
}

function lecture(changes: object = {}, video: object = {}): Observable<unknown> {
    return data({video: {
        has_transcript: false,
        studyAids: {video_id: '7', generation: 'ready', summary: SUMMARY, quiz: QUIZ, ...changes},
        ...video,
    }});
}

function httpError(status: number): Observable<never> {
    return throwError(() => new HttpErrorResponse({status}));
}

describe('StudyAidsService', () => {
    let service: StudyAidsService;
    let man: jasmine.SpyObj<Pick<ManService, 'post'>>;
    let handlers: Record<string, Handler>;

    const latest = (videoId: number): StudyAidsState => {
        let state: StudyAidsState = {status: 'loading'};
        service.watch(videoId).subscribe(value => state = value).unsubscribe();

        return state;
    };
    const calls = (operation: string) => man.post.calls.all().filter(call => (call.args[1] as Body).operationName === operation);
    const variablesOf = (operation: string) => (calls(operation).pop()?.args[1] as Body).variables;

    beforeEach(() => {
        handlers = {StudyAids: () => lecture()};
        man = jasmine.createSpyObj('ManService', ['post']);
        man.post.and.callFake(((path: string, body: Body | FormData) => {
            expect(path).toBe('graphql');
            const operation = body instanceof FormData ? JSON.parse(body.get('operations') as string) as Body : body;
            const handler = handlers[operation.operationName];

            return handler ? handler(operation.variables) : graphqlError('No handler for ' + operation.operationName);
        }) as never);
        TestBed.configureTestingModule({
            providers: [{provide: ManService, useValue: man}],
        });
        service = TestBed.inject(StudyAidsService);
    });

    describe('watch', () => {
        it('reads a lecture\'s summary and quiz', () => {
            const state = latest(7);

            expect(variablesOf('StudyAids')).toEqual({id: '7'});
            expect(state.status).toBe('ready');
            if (state.status === 'ready') {
                expect(state.aids.video_id).toBe(7);
                expect(state.aids.generation).toBe('ready');
                expect(state.aids.has_transcript).toBeFalse();
                expect(state.aids.summary).toEqual(SUMMARY);
                expect(state.aids.quiz?.questions[0].time).toBe(465);
            }
        });

        it('reads whether there is a transcript', () => {
            handlers['StudyAids'] = () => lecture({}, {has_transcript: true});
            const state = latest(7);

            expect(state.status === 'ready' && state.aids.has_transcript).toBeTrue();
        });

        it('asks once for both tabs', () => {
            latest(7);
            latest(7);

            expect(calls('StudyAids').length).toBe(1);
        });

        it('drops a malformed question and keeps the rest', () => {
            handlers['StudyAids'] = () => lecture({quiz: {...QUIZ, questions: [QUESTION, {...QUESTION, id: 'bad', answer: 9}]}});
            const state = latest(7);

            expect(state.status === 'ready' && state.aids.quiz?.questions.map(question => question.id)).toEqual([QUESTION.id]);
        });

        it('shows nothing for a lecture FlickMan does not have', () => {
            handlers['StudyAids'] = () => data({video: null});

            expect(latest(7).status).toBe('unavailable');
            handlers['StudyAids'] = () => lecture();
            expect(latest(8).status).toBe('ready');
        });

        it('stops asking once the server turns out to have no study aids', () => {
            handlers['StudyAids'] = () => graphqlError('Cannot query field "studyAids" on type "Video".');

            expect(latest(7).status).toBe('unavailable');
            expect(latest(8).status).toBe('unavailable');
            expect(calls('StudyAids').length).toBe(1);
        });

        it('asks again after a failure, such as the rate limit', () => {
            handlers['StudyAids'] = () => graphqlError('Rate limit for Video.studyAids exceeded. Try again later.');

            expect(latest(7).status).toBe('error');
            handlers['StudyAids'] = () => httpError(0);
            expect(latest(7).status).toBe('error');
            handlers['StudyAids'] = () => lecture();
            expect(latest(7).status).toBe('ready');
        });
    });

    describe('answer', () => {
        it('records the answer and shows the new class stats', () => {
            latest(7);
            handlers['AnswerStudyQuestion'] = () => data({answerStudyQuestion: {answered: 13, correct: 11}});
            service.answer(7, QUESTION.id, 2).subscribe();

            expect(variablesOf('AnswerStudyQuestion')).toEqual({video_id: '7', question_id: QUESTION.id, choice: 2});
            const state = latest(7);
            const question = state.status === 'ready' ? state.aids.quiz?.questions[0] : undefined;
            expect(question?.stats).toEqual({answered: 13, correct: 11});
            expect(question?.mine).toBe(2);
        });

        it('reloads the quiz when the question has gone', () => {
            latest(7);
            handlers['AnswerStudyQuestion'] = () => data({answerStudyQuestion: null});
            service.answer(7, QUESTION.id, 2).subscribe();

            expect(calls('StudyAids').length).toBe(2);
        });
    });

    describe('transcript', () => {
        const latestTranscript = (videoId: number): TranscriptState => {
            let state: TranscriptState = {status: 'loading'};
            service.transcript(videoId).subscribe(value => state = value).unsubscribe();

            return state;
        };

        it('reads the paragraphs in the order spoken, once a visit', () => {
            handlers['LectureTranscript'] = () => data({video: {transcript: {paragraphs: [
                {time: 70, text: 'The smooth ER stores Ca²⁺.'},
                {time: 65, text: 'overlap'},
                {time: 5, text: '  '},
            ]}}});

            expect(latestTranscript(7)).toEqual({status: 'ready', paragraphs: [{time: 70, text: 'The smooth ER stores Ca²⁺.'}, {time: 65, text: 'overlap'}]});
            latestTranscript(7);
            expect(calls('LectureTranscript').length).toBe(1);
            expect(variablesOf('LectureTranscript')).toEqual({id: '7'});
        });

        it('knows a lecture without a transcript from a failure', () => {
            handlers['LectureTranscript'] = () => data({video: {transcript: null}});
            expect(latestTranscript(7)).toEqual({status: 'none'});

            handlers['LectureTranscript'] = () => graphqlError('Rate limit for Video.transcript exceeded. Try again later.');
            expect(latestTranscript(8)).toEqual({status: 'error', limited: true});
        });

        it('only tries again when asked', () => {
            handlers['LectureTranscript'] = () => httpError(500);
            expect(latestTranscript(7)).toEqual({status: 'error', limited: false});
            latestTranscript(7);
            expect(calls('LectureTranscript').length).toBe(1);

            handlers['LectureTranscript'] = () => data({video: {transcript: {paragraphs: [{time: 0, text: 'Hello'}]}}});
            service.retryTranscript(7);
            expect(latestTranscript(7).status).toBe('ready');
        });
    });

    describe('ticks', () => {
        it('reads the ticks kept for this reader', () => {
            handlers['StudyAids'] = () => lecture({my_ticks: ['k3x9', 'a1-b2']});
            const state = latest(7);

            expect(state.status === 'ready' && state.aids.my_ticks).toEqual(['k3x9', 'a1-b2']);
            handlers['StudyAids'] = () => lecture({my_ticks: null});
            const fresh = latest(8);
            expect(fresh.status === 'ready' && fresh.aids.my_ticks).toBeNull();
        });

        it('keeps a lecture\'s ticks on FlickMan', () => {
            handlers['SaveStudyTicks'] = () => data({saveStudyTicks: ['k3x9', 'a1-b2']});
            let saved: string[] | undefined;
            service.saveTicks(7, ['k3x9', 'a1-b2', 'k3x9']).subscribe(ticks => saved = ticks);

            expect(variablesOf('SaveStudyTicks')).toEqual({video_id: '7', ticks: ['k3x9', 'a1-b2', 'k3x9']});
            expect(saved).toEqual(['k3x9', 'a1-b2']);
        });
    });
});
