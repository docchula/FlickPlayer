import {TestBed} from '@angular/core/testing';
import {HttpErrorResponse} from '@angular/common/http';
import {Observable, of, throwError} from 'rxjs';
import {ManService} from './man.service';
import {StudyAidsService} from './study-aids.service';
import {SaveFailure, StudyAidsState, SummaryPart} from './study-aids/study-aids.model';

const SUMMARY = {
    markdown: '## Nucleus [00:01:10]\n\n1. **Barr body** : X − 1',
    revision: 1,
    origin: 'ai',
    edited: false,
    contributors: [],
    updated_at: '2026-10-08T14:41:13+07:00',
};

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

function aidsResponse(changes: object = {}) {
    return {
        status: 'success',
        data: {
            video_id: 7,
            can_edit: true,
            generation: 'ready',
            summary: SUMMARY,
            quiz: {questions: [QUESTION], revision: 2, origin: 'ai', edited: true, contributors: [{name: 'Kan & Chain'}], updated_at: null},
            ...changes,
        },
    };
}

function httpError(status: number, body: unknown = null): Observable<never> {
    return throwError(() => new HttpErrorResponse({status, error: body}));
}

describe('StudyAidsService', () => {
    let service: StudyAidsService;
    let man: jasmine.SpyObj<Pick<ManService, 'get' | 'post'>>;

    const latest = (videoId: number): StudyAidsState => {
        let state: StudyAidsState = {status: 'loading'};
        service.watch(videoId).subscribe(value => state = value).unsubscribe();

        return state;
    };

    beforeEach(() => {
        man = jasmine.createSpyObj('ManService', ['get', 'post']);
        man.get.and.returnValue(of(aidsResponse()));
        TestBed.configureTestingModule({
            providers: [{provide: ManService, useValue: man}],
        });
        service = TestBed.inject(StudyAidsService);
    });

    describe('watch', () => {
        it('reads a lecture\'s summary and quiz', () => {
            const state = latest(7);

            expect(man.get).toHaveBeenCalledWith('v1/study_aids/7');
            expect(state.status).toBe('ready');
            if (state.status === 'ready') {
                expect(state.aids.can_edit).toBeTrue();
                expect(state.aids.summary?.markdown).toBe(SUMMARY.markdown);
                expect(state.aids.quiz?.questions[0].time).toBe(465);
                expect(state.aids.quiz?.contributors).toEqual([{name: 'Kan & Chain'}]);
            }
        });

        it('asks once for both cards', () => {
            latest(7);
            latest(7);

            expect(man.get).toHaveBeenCalledTimes(1);
        });

        it('drops a malformed question and keeps the rest', () => {
            man.get.and.returnValue(of(aidsResponse({
                quiz: {questions: [QUESTION, {...QUESTION, id: 'bad', answer: 9}], revision: 1, origin: 'ai', edited: false, contributors: []},
            })));
            const state = latest(7);

            expect(state.status === 'ready' && state.aids.quiz?.questions.map(question => question.id)).toEqual([QUESTION.id]);
        });

        it('shows nothing for a lecture FlickMan does not know', () => {
            man.get.and.returnValue(httpError(404, {status: 'error', message: 'No such video.'}));

            expect(latest(7).status).toBe('unavailable');
            man.get.and.returnValue(of(aidsResponse()));
            expect(latest(8).status).toBe('ready');
        });

        it('stops asking once the server turns out to have no study aids', () => {
            man.get.and.returnValue(httpError(404, {message: 'Not Found'}));

            expect(latest(7).status).toBe('unavailable');
            expect(latest(8).status).toBe('unavailable');
            expect(man.get).toHaveBeenCalledTimes(1);
        });

        it('asks again after a failure', () => {
            man.get.and.returnValue(httpError(500));

            expect(latest(7).status).toBe('error');
            man.get.and.returnValue(of(aidsResponse()));
            expect(latest(7).status).toBe('ready');
        });
    });

    describe('saveSummary', () => {
        const change = {markdown: '## New', revision: 1, credit: true, credit_name: 'Kan'};

        it('sends the change and shows the saved summary', () => {
            latest(7);
            man.post.and.returnValue(of({status: 'success', data: {...SUMMARY, markdown: '## New', revision: 2, edited: true, contributors: [{name: 'Kan'}]}}));
            let saved: SummaryPart | undefined;
            service.saveSummary(7, change).subscribe(part => saved = part);

            expect(man.post).toHaveBeenCalledWith('v1/study_aids/7/summary', change);
            expect(saved?.revision).toBe(2);
            const state = latest(7);
            expect(state.status === 'ready' && state.aids.summary?.markdown).toBe('## New');
        });

        it('reports a conflict with the version saved first', () => {
            latest(7);
            man.post.and.returnValue(httpError(409, {status: 'error', message: 'Stale', data: {...SUMMARY, revision: 5, markdown: '## Theirs'}}));
            let failure: SaveFailure | undefined;
            service.saveSummary(7, change).subscribe({error: error => failure = error});

            expect(failure?.kind).toBe('conflict');
            expect(failure?.kind === 'conflict' && failure.current?.revision).toBe(5);
            const state = latest(7);
            expect(state.status === 'ready' && state.aids.summary?.markdown).toBe('## Theirs');
        });

        it('passes on validation messages', () => {
            man.post.and.returnValue(httpError(422, {status: 'error', message: 'Invalid', errors: {markdown: ['The markdown is required.']}}));
            let failure: SaveFailure | undefined;
            service.saveSummary(7, change).subscribe({error: error => failure = error});

            expect(failure).toEqual({kind: 'invalid', message: 'Invalid', errors: {markdown: ['The markdown is required.']}});
        });

        it('tells a rate limit and a lost connection apart', () => {
            let failure: SaveFailure | undefined;
            man.post.and.returnValue(httpError(429, {message: 'Too Many Attempts.'}));
            service.saveSummary(7, change).subscribe({error: error => failure = error});
            expect(failure?.kind).toBe('rate-limited');

            man.post.and.returnValue(httpError(0));
            service.saveSummary(7, change).subscribe({error: error => failure = error});
            expect(failure?.kind).toBe('network');
        });
    });

    describe('answer', () => {
        it('records the answer and shows the new class stats', () => {
            latest(7);
            man.post.and.returnValue(of({status: 'success', data: {answered: 13, correct: 11}}));
            service.answer(7, QUESTION.id, 2).subscribe();

            expect(man.post).toHaveBeenCalledWith('v1/study_aids/7/answers', {question_id: QUESTION.id, choice: 2});
            const state = latest(7);
            const question = state.status === 'ready' ? state.aids.quiz?.questions[0] : undefined;
            expect(question?.stats).toEqual({answered: 13, correct: 11});
            expect(question?.mine).toBe(2);
        });

        it('reloads the quiz when the question has gone', () => {
            latest(7);
            man.post.and.returnValue(httpError(404, {status: 'error', message: 'No such question.'}));
            service.answer(7, QUESTION.id, 2).subscribe();

            expect(man.get).toHaveBeenCalledTimes(2);
        });
    });
});
