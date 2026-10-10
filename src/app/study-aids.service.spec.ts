import {TestBed} from '@angular/core/testing';
import {HttpErrorResponse} from '@angular/common/http';
import {Observable, of, throwError} from 'rxjs';
import {ManService} from './man.service';
import {StudyAidsService} from './study-aids.service';
import {EditorProfile, QuizPart, SaveFailure, StudyAidsState, SummaryPart, SummaryRevision, TranscriptState} from './study-aids/study-aids.model';

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
            can_manage: true,
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
                expect(state.aids.can_manage).toBeTrue();
                expect(state.aids.summary?.markdown).toBe(SUMMARY.markdown);
                expect(state.aids.quiz?.questions[0].time).toBe(465);
                expect(state.aids.quiz?.contributors).toEqual([{name: 'Kan & Chain'}]);
                expect(state.aids.has_transcript).toBeFalse();
                expect(state.aids.summary?.verified).toBeNull();
            }
        });

        it('reads who verified a part and whether there is a transcript', () => {
            man.get.and.returnValue(of(aidsResponse({
                has_transcript: true,
                summary: {...SUMMARY, verified: {revision: 1, by: [{name: 'Ajarn Dev'}], at: '2026-10-09T16:52:22+00:00'}},
            })));
            const state = latest(7);

            expect(state.status === 'ready' && state.aids.has_transcript).toBeTrue();
            expect(state.status === 'ready' && state.aids.summary?.verified)
                .toEqual({revision: 1, by: [{name: 'Ajarn Dev'}], at: '2026-10-09T16:52:22+00:00'});
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
        const change = {markdown: '## New', revision: 1, credit: true};

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

    describe('editors', () => {
        const editor = {email: 'kan@docchula.com', name: 'Kan', role: 'admin', added_at: '2026-10-08T14:41:13+07:00'};

        it('lists the editors', () => {
            man.get.and.returnValue(of({status: 'success', data: {editors: [editor, {email: 'new@docchula.com', name: null, role: 'editor', added_at: null}]}}));
            let editors: unknown;
            service.editors().subscribe(list => editors = list);

            expect(man.get).toHaveBeenCalledWith('v1/study_aids/editors');
            expect(editors).toEqual([editor, {email: 'new@docchula.com', name: null, role: 'editor', added_at: null}]);
        });

        it('adds, changes and removes an editor', () => {
            man.post.and.returnValue(of({status: 'success', data: editor}));
            service.saveEditor('kan@docchula.com', 'admin').subscribe();
            man.post.and.returnValue(of({status: 'success', data: null}));
            let removed = false;
            service.removeEditor('kan@docchula.com').subscribe(() => removed = true);

            expect(man.post).toHaveBeenCalledWith('v1/study_aids/editors', {email: 'kan@docchula.com', role: 'admin'});
            expect(man.post).toHaveBeenCalledWith('v1/study_aids/editors/remove', {email: 'kan@docchula.com'});
            expect(removed).toBeTrue();
        });

        it('passes on why FlickMan refused', () => {
            man.post.and.returnValue(httpError(422, {status: 'error', message: 'Invalid', errors: {email: ['This would leave no admin.']}}));
            let failure: SaveFailure | undefined;
            service.removeEditor('kan@docchula.com').subscribe({error: error => failure = error});

            expect(failure).toEqual({kind: 'invalid', message: 'Invalid', errors: {email: ['This would leave no admin.']}});
        });
    });

    describe('uploadImage', () => {
        it('posts the image as a form and returns where it is stored', () => {
            const url = 'https://flick-man-app.docchula.com/v1/study_aids/images/01M4D7B2STKMV08W6Z0ZF3G56N.webp';
            man.post.and.returnValue(of({status: 'success', data: {url, width: 800, height: 600}}));
            let uploaded: unknown;
            service.uploadImage(7, new Blob(['x'], {type: 'image/webp'}), 'er.webp').subscribe(image => uploaded = image);

            const [path, body] = man.post.calls.mostRecent().args;
            expect(path).toBe('v1/study_aids/7/images');
            expect(body instanceof FormData && (body.get('image') as File).name).toBe('er.webp');
            expect(uploaded).toEqual({url, width: 800, height: 600});
        });
    });

    describe('verify', () => {
        it('marks the version on show as verified and shows it', () => {
            latest(7);
            const verified = {revision: 1, by: [{name: 'Ajarn Dev'}], at: '2026-10-09T16:52:22+00:00'};
            man.post.and.returnValue(of({status: 'success', data: {...SUMMARY, verified}}));
            let part: SummaryPart | QuizPart | undefined;
            service.verify(7, 'summary', 1, true).subscribe(saved => part = saved);

            expect(man.post).toHaveBeenCalledWith('v1/study_aids/7/summary/verify', {revision: 1, verified: true});
            expect(part?.verified).toEqual(verified);
            const state = latest(7);
            expect(state.status === 'ready' && state.aids.summary?.verified?.by).toEqual([{name: 'Ajarn Dev'}]);
        });

        it('shows the newer version when the quiz changed in the meantime', () => {
            latest(7);
            man.post.and.returnValue(httpError(409, {status: 'error', message: 'The quiz changed since you opened it.', data: {
                questions: [QUESTION], revision: 3, origin: 'ai', edited: true, contributors: [], updated_at: null, verified: null,
            }}));
            let failure: SaveFailure | undefined;
            service.verify(7, 'quiz', 2, true).subscribe({error: error => failure = error});

            expect(man.post).toHaveBeenCalledWith('v1/study_aids/7/quiz/verify', {revision: 2, verified: true});
            expect(failure?.kind).toBe('conflict');
            const state = latest(7);
            expect(state.status === 'ready' && state.aids.quiz?.revision).toBe(3);
        });
    });

    describe('revisions', () => {
        const revisions = {status: 'success', data: {revisions: [
            {revision: 2, author: {key: 'e1', name: 'Kan & Chain'}, created_at: '2026-10-09T16:52:10+00:00', markdown: '## Mine'},
            {revision: 1, author: null, created_at: '2026-10-09T16:52:10+00:00', markdown: '## AI'},
            {revision: 3, author: {key: 'e2', name: null}, created_at: null},
        ]}};

        it('fetches the versions once for the version on show, oldest first', () => {
            man.get.and.returnValue(of(revisions));
            let fetched: SummaryRevision[] | undefined;
            service.summaryRevisions(7, 2).subscribe(list => fetched = list);
            service.summaryRevisions(7, 2).subscribe();

            expect(man.get).toHaveBeenCalledOnceWith('v1/study_aids/7/summary/revisions');
            expect(fetched?.map(revision => [revision.revision, revision.author?.name ?? null, revision.content]))
                .toEqual([[1, null, '## AI'], [2, 'Kan & Chain', '## Mine']]);

            service.summaryRevisions(7, 3).subscribe();
            expect(man.get).toHaveBeenCalledTimes(2);
        });

        it('asks again after a failure', () => {
            man.get.and.returnValue(httpError(500));
            let failure: SaveFailure | undefined;
            service.quizRevisions(7, 2).subscribe({error: error => failure = error});
            man.get.and.returnValue(of({status: 'success', data: {revisions: [
                {revision: 1, author: null, created_at: null, questions: [QUESTION, {id: 'bad'}]},
            ]}}));
            let questions: unknown;
            service.quizRevisions(7, 2).subscribe(list => questions = list[0].content.map(question => question.id));

            expect(failure?.kind).toBe('failed');
            expect(man.get).toHaveBeenCalledWith('v1/study_aids/7/quiz/revisions');
            expect(questions).toEqual([QUESTION.id]);
        });
    });

    describe('transcript', () => {
        const latestTranscript = (videoId: number): TranscriptState => {
            let state: TranscriptState = {status: 'loading'};
            service.transcript(videoId).subscribe(value => state = value).unsubscribe();

            return state;
        };

        it('reads the paragraphs in the order spoken, once a visit', () => {
            man.get.and.returnValue(of({status: 'success', data: {video_id: 7, paragraphs: [
                {time: 70, text: 'The smooth ER stores Ca²⁺.'},
                {time: 65, text: 'overlap'},
                {time: 5, text: '  '},
            ]}}));

            expect(latestTranscript(7)).toEqual({status: 'ready', paragraphs: [{time: 70, text: 'The smooth ER stores Ca²⁺.'}, {time: 65, text: 'overlap'}]});
            latestTranscript(7);
            expect(man.get).toHaveBeenCalledOnceWith('v1/study_aids/7/transcript');
        });

        it('knows a lecture without a transcript from a failure', () => {
            man.get.and.returnValue(httpError(404, {status: 'error', message: 'This lecture has no transcript.'}));
            expect(latestTranscript(7)).toEqual({status: 'none'});

            man.get.and.returnValue(httpError(429, {message: 'Too Many Attempts.'}));
            expect(latestTranscript(8)).toEqual({status: 'error', limited: true});
        });

        it('only tries again when asked', () => {
            man.get.and.returnValue(httpError(500));
            expect(latestTranscript(7)).toEqual({status: 'error', limited: false});
            latestTranscript(7);
            expect(man.get).toHaveBeenCalledTimes(1);

            man.get.and.returnValue(of({status: 'success', data: {video_id: 7, paragraphs: [{time: 0, text: 'Hello'}]}}));
            service.retryTranscript(7);
            expect(latestTranscript(7).status).toBe('ready');
        });
    });

    describe('profile', () => {
        const profile = {name: 'Local Developer', changed_at: null, next_change_at: null};
        const latestProfile = (): EditorProfile | null => {
            let value: EditorProfile | null = null;
            service.profile().subscribe(found => value = found).unsubscribe();

            return value;
        };

        it('reads the editor\'s display name once', () => {
            man.get.and.returnValue(of({status: 'success', data: profile}));

            expect(latestProfile()).toEqual(profile);
            latestProfile();
            expect(man.get).toHaveBeenCalledOnceWith('v1/study_aids/me');
        });

        it('stops asking once the reader turns out not to be an editor', () => {
            man.get.and.returnValue(httpError(403, {status: 'error', message: 'Only study-aid editors have a display name.'}));

            expect(latestProfile()).toBeNull();
            latestProfile();
            expect(man.get).toHaveBeenCalledTimes(1);
        });

        it('changes the name and shows it on the lectures open', () => {
            man.get.and.returnValue(of(aidsResponse()));
            const watching = service.watch(7).subscribe();
            const renamed = {name: 'Ajarn Dev', changed_at: '2026-10-09T16:52:22+00:00', next_change_at: '2026-11-08T16:52:22+00:00'};
            man.post.and.returnValue(of({status: 'success', data: renamed}));
            service.saveProfile('Ajarn Dev').subscribe();

            expect(man.post).toHaveBeenCalledWith('v1/study_aids/me', {name: 'Ajarn Dev'});
            expect(latestProfile()).toEqual(renamed);
            expect(man.get).toHaveBeenCalledTimes(2);
            watching.unsubscribe();
        });

        it('passes on why a new name was refused', () => {
            man.post.and.returnValue(httpError(422, {
                status: 'error',
                message: 'You can change your display name again on 8 Nov 2026.',
                errors: {name: ['You can change your display name again on 8 Nov 2026.']},
            }));
            let failure: SaveFailure | undefined;
            service.saveProfile('Kan').subscribe({error: error => failure = error});

            expect(failure?.kind).toBe('invalid');
        });
    });
});
