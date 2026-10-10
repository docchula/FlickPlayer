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
    updated_at: '2026-10-10T03:28:25+00:00',
    verified: null,
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

const QUIZ = {questions: [QUESTION], revision: 2, origin: 'ai', edited: true, contributors: [{name: 'Kan & Chain'}], updated_at: null, verified: null};

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
        studyAids: {video_id: '7', can_edit: true, can_manage: true, generation: 'ready', summary: SUMMARY, quiz: QUIZ, ...changes},
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
                expect(state.aids.can_edit).toBeTrue();
                expect(state.aids.can_manage).toBeTrue();
                expect(state.aids.has_transcript).toBeFalse();
                expect(state.aids.summary?.markdown).toBe(SUMMARY.markdown);
                expect(state.aids.summary?.verified).toBeNull();
                expect(state.aids.quiz?.questions[0].time).toBe(465);
                expect(state.aids.quiz?.contributors).toEqual([{name: 'Kan & Chain'}]);
            }
        });

        it('reads who verified a part and whether there is a transcript', () => {
            handlers['StudyAids'] = () => lecture({
                summary: {...SUMMARY, verified: {revision: 1, by: [{name: 'Ajarn Dev'}], at: '2026-10-10T03:28:39+00:00'}},
            }, {has_transcript: true});
            const state = latest(7);

            expect(state.status === 'ready' && state.aids.has_transcript).toBeTrue();
            expect(state.status === 'ready' && state.aids.summary?.verified)
                .toEqual({revision: 1, by: [{name: 'Ajarn Dev'}], at: '2026-10-10T03:28:39+00:00'});
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

    describe('saveSummary', () => {
        const change = {markdown: '## New', revision: 1, credit: true};

        it('sends the change and shows the saved summary', () => {
            latest(7);
            handlers['SaveStudySummary'] = () => data({saveStudySummary: {
                outcome: 'saved',
                summary: {...SUMMARY, markdown: '## New', revision: 2, edited: true, contributors: [{name: 'Kan'}]},
            }});
            let saved: SummaryPart | undefined;
            service.saveSummary(7, change).subscribe(part => saved = part);

            expect(variablesOf('SaveStudySummary')).toEqual({video_id: '7', markdown: '## New', revision: 1, credit: true});
            expect(saved?.revision).toBe(2);
            const state = latest(7);
            expect(state.status === 'ready' && state.aids.summary?.markdown).toBe('## New');
        });

        it('reports a conflict with the version saved first', () => {
            latest(7);
            handlers['SaveStudySummary'] = () => data({saveStudySummary: {outcome: 'conflict', summary: {...SUMMARY, revision: 5, markdown: '## Theirs'}}});
            let failure: SaveFailure | undefined;
            service.saveSummary(7, change).subscribe({error: error => failure = error});

            expect(failure?.kind).toBe('conflict');
            expect(failure?.kind === 'conflict' && failure.current?.revision).toBe(5);
            const state = latest(7);
            expect(state.status === 'ready' && state.aids.summary?.markdown).toBe('## Theirs');
        });

        it('passes on validation messages under their fields', () => {
            handlers['SaveStudySummary'] = () => graphqlError('Validation failed for the field [saveStudySummary].', {
                validation: {markdown: ['The markdown field is required.']},
            });
            let failure: SaveFailure | undefined;
            service.saveSummary(7, change).subscribe({error: error => failure = error});

            expect(failure).toEqual({kind: 'invalid', message: 'The markdown field is required.', errors: {markdown: ['The markdown field is required.']}});
        });

        it('tells a refusal, the rate limit and a lost connection apart', () => {
            let failure: SaveFailure | undefined;
            handlers['SaveStudySummary'] = () => graphqlError('Only study-aid editors can change the summary.', {category: 'authorization'});
            service.saveSummary(7, change).subscribe({error: error => failure = error});
            expect(failure?.kind).toBe('forbidden');

            handlers['SaveStudySummary'] = () => graphqlError('Rate limit for Mutation.saveStudySummary exceeded. Try again later.');
            service.saveSummary(7, change).subscribe({error: error => failure = error});
            expect(failure?.kind).toBe('rate-limited');

            handlers['SaveStudySummary'] = () => httpError(0);
            service.saveSummary(7, change).subscribe({error: error => failure = error});
            expect(failure?.kind).toBe('network');
        });
    });

    describe('saveQuiz', () => {
        it('sends the questions as FlickMan takes them', () => {
            handlers['SaveStudyQuiz'] = () => data({saveStudyQuiz: {outcome: 'unchanged', quiz: QUIZ}});
            const questions = [{id: null, prompt: 'Which?', choices: ['A', 'B'], answer: 1, explanation: null, time: null}];
            let saved: QuizPart | undefined;
            service.saveQuiz(7, {questions, revision: 2, credit: false}).subscribe(part => saved = part);

            expect(variablesOf('SaveStudyQuiz')).toEqual({video_id: '7', questions, revision: 2, credit: false});
            expect(saved?.questions.length).toBe(1);
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

    describe('verify', () => {
        it('marks the version on show as verified and shows it', () => {
            latest(7);
            const verified = {revision: 1, by: [{name: 'Ajarn Dev'}], at: '2026-10-10T03:28:39+00:00'};
            handlers['VerifyStudySummary'] = () => data({verifyStudySummary: {outcome: 'saved', summary: {...SUMMARY, verified}}});
            let part: SummaryPart | QuizPart | undefined;
            service.verify(7, 'summary', 1, true).subscribe(saved => part = saved);

            expect(variablesOf('VerifyStudySummary')).toEqual({video_id: '7', revision: 1, verified: true});
            expect(part?.verified).toEqual(verified);
            const state = latest(7);
            expect(state.status === 'ready' && state.aids.summary?.verified?.by).toEqual([{name: 'Ajarn Dev'}]);
        });

        it('shows the newer version when the quiz changed in the meantime', () => {
            latest(7);
            handlers['VerifyStudyQuiz'] = () => data({verifyStudyQuiz: {outcome: 'conflict', quiz: {...QUIZ, revision: 3}}});
            let failure: SaveFailure | undefined;
            service.verify(7, 'quiz', 2, true).subscribe({error: error => failure = error});

            expect(failure?.kind).toBe('conflict');
            const state = latest(7);
            expect(state.status === 'ready' && state.aids.quiz?.revision).toBe(3);
        });

        it('says so when the part has gone', () => {
            handlers['VerifyStudyQuiz'] = () => data({verifyStudyQuiz: {outcome: 'missing', quiz: null}});
            let failure: SaveFailure | undefined;
            service.verify(7, 'quiz', 2, true).subscribe({error: error => failure = error});

            expect(failure).toEqual({kind: 'failed', message: 'This lecture has no quiz yet.'});
        });
    });

    describe('revisions', () => {
        const revisions = [
            {revision: 2, author: {key: 'e1', name: 'Kan & Chain'}, created_at: '2026-10-10T03:28:25+00:00', markdown: '## Mine'},
            {revision: 1, author: null, created_at: '2026-10-10T03:28:25+00:00', markdown: '## AI'},
        ];

        it('fetches the versions once for the version on show, oldest first', () => {
            handlers['StudySummaryRevisions'] = () => data({video: {studyAids: {summary: {revisions}}}});
            let fetched: SummaryRevision[] | undefined;
            service.summaryRevisions(7, 2).subscribe(list => fetched = list);
            service.summaryRevisions(7, 2).subscribe();

            expect(calls('StudySummaryRevisions').length).toBe(1);
            expect(fetched?.map(revision => [revision.revision, revision.author?.name ?? null, revision.content]))
                .toEqual([[1, null, '## AI'], [2, 'Kan & Chain', '## Mine']]);

            service.summaryRevisions(7, 3).subscribe();
            expect(calls('StudySummaryRevisions').length).toBe(2);
        });

        it('asks again after a failure', () => {
            handlers['StudyQuizRevisions'] = () => httpError(500);
            let failure: SaveFailure | undefined;
            service.quizRevisions(7, 2).subscribe({error: error => failure = error});
            handlers['StudyQuizRevisions'] = () => data({video: {studyAids: {quiz: {revisions: [
                {revision: 1, author: null, created_at: null, questions: [QUESTION, {id: 'bad'}]},
            ]}}}});
            let questions: unknown;
            service.quizRevisions(7, 2).subscribe(list => questions = list[0].content.map(question => question.id));

            expect(failure?.kind).toBe('failed');
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

    describe('profile', () => {
        const profile = {name: 'Local Developer', changed_at: null, next_change_at: null};
        const latestProfile = (): EditorProfile | null => {
            let value: EditorProfile | null = null;
            service.profile().subscribe(found => value = found).unsubscribe();

            return value;
        };

        it('reads the editor\'s display name once', () => {
            handlers['StudyAidDisplayName'] = () => data({studyAidDisplayName: profile});

            expect(latestProfile()).toEqual(profile);
            latestProfile();
            expect(calls('StudyAidDisplayName').length).toBe(1);
        });

        it('stops asking once the reader turns out not to be an editor', () => {
            handlers['StudyAidDisplayName'] = () => graphqlError('Only study-aid editors have a display name.', {category: 'authorization'});

            expect(latestProfile()).toBeNull();
            latestProfile();
            expect(calls('StudyAidDisplayName').length).toBe(1);
        });

        it('changes the name and shows it on the lectures open', () => {
            const watching = service.watch(7).subscribe();
            const renamed = {name: 'Ajarn Dev', changed_at: '2026-10-10T03:28:39+00:00', next_change_at: '2026-11-09T03:28:39+00:00'};
            handlers['ChangeStudyAidDisplayName'] = () => data({changeStudyAidDisplayName: renamed});
            service.saveProfile('Ajarn Dev').subscribe();

            expect(variablesOf('ChangeStudyAidDisplayName')).toEqual({name: 'Ajarn Dev'});
            expect(latestProfile()).toEqual(renamed);
            expect(calls('StudyAids').length).toBe(2);
            watching.unsubscribe();
        });

        it('passes on why a new name was refused', () => {
            handlers['ChangeStudyAidDisplayName'] = () => graphqlError('You can change your display name again on 8 Nov 2026.', {
                validation: {name: ['You can change your display name again on 8 Nov 2026.']},
            });
            let failure: SaveFailure | undefined;
            service.saveProfile('Kan').subscribe({error: error => failure = error});

            expect(failure?.kind === 'invalid' && failure.message).toBe('You can change your display name again on 8 Nov 2026.');
        });
    });

    describe('editors', () => {
        const editor = {email: 'kan@docchula.com', name: 'Kan', role: 'admin', added_at: '2026-10-10T03:28:24+00:00'};

        it('lists the editors', () => {
            handlers['StudyAidEditors'] = () => data({studyAidEditors: [editor, {email: 'new@docchula.com', name: null, role: 'editor', added_at: null}]});
            let editors: unknown;
            service.editors().subscribe(list => editors = list);

            expect(editors).toEqual([editor, {email: 'new@docchula.com', name: null, role: 'editor', added_at: null}]);
        });

        it('adds, changes and removes an editor', () => {
            handlers['GrantStudyAidRole'] = () => data({grantStudyAidRole: editor});
            handlers['RemoveStudyAidRole'] = () => data({removeStudyAidRole: true});
            service.saveEditor('kan@docchula.com', 'admin').subscribe();
            let removed = false;
            service.removeEditor('kan@docchula.com').subscribe(() => removed = true);

            expect(variablesOf('GrantStudyAidRole')).toEqual({email: 'kan@docchula.com', role: 'admin'});
            expect(variablesOf('RemoveStudyAidRole')).toEqual({email: 'kan@docchula.com'});
            expect(removed).toBeTrue();
        });

        it('passes on why FlickMan refused', () => {
            handlers['GrantStudyAidRole'] = () => graphqlError('Validation failed for the field [grantStudyAidRole].', {
                validation: {email: ['Only @docchula.com Google accounts can sign in to FlickPlayer.']},
            });
            let failure: SaveFailure | undefined;
            service.saveEditor('kan@gmail.com', 'editor').subscribe({error: error => failure = error});

            expect(failure?.kind === 'invalid' && failure.errors).toEqual({email: ['Only @docchula.com Google accounts can sign in to FlickPlayer.']});
        });
    });

    describe('uploadImage', () => {
        it('sends the image as a GraphQL multipart request and returns where it is stored', () => {
            const url = 'https://flick-man-app.docchula.com/v1/study_aids/images/01m4hxp2t0g66v2xzfmjsjb827.webp';
            handlers['UploadStudyAidImage'] = () => data({uploadStudyAidImage: {url, width: 800, height: 600}});
            let uploaded: unknown;
            service.uploadImage(7, new Blob(['x'], {type: 'image/webp'}), 'er.webp').subscribe(image => uploaded = image);

            const form = man.post.calls.mostRecent().args[1] as FormData;
            expect(JSON.parse(form.get('operations') as string).variables).toEqual({video_id: '7', image: null});
            expect(JSON.parse(form.get('map') as string)).toEqual({0: ['variables.image']});
            expect((form.get('0') as File).name).toBe('er.webp');
            expect(uploaded).toEqual({url, width: 800, height: 600});
        });
    });
});
