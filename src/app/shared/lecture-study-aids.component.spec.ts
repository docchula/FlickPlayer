import {ComponentFixture, TestBed} from '@angular/core/testing';
import {By} from '@angular/platform-browser';
import {ActivatedRoute, convertToParamMap} from '@angular/router';
import {AlertController, ModalController} from '@ionic/angular';
import {BehaviorSubject, of} from 'rxjs';
import {LectureStudyAidsComponent} from './lecture-study-aids.component';
import {QuizBodyComponent} from './quiz-body.component';
import {StudyAidsService} from '../study-aids.service';
import {Lecture} from '../man.service';
import {QuizQuestion, StudyAids, StudyAidsState, TranscriptState} from '../study-aids/study-aids.model';

const VIDEO = {id: 7, title: 'Organelles', duration: 3000} as Lecture;

const MARKDOWN = '# Organelles\n\n## Nucleus [00:01:10]\n\n1. **Barr body** : X − 1\n2. **Nucleolus** : rRNA\n';

function question(id: string, answer: number, mine: number | null = null): QuizQuestion {
    return {
        id,
        prompt: 'Question ' + id,
        choices: ['Plasma cell', 'Pancreatic acinar cell', 'Leydig cell', 'Neutrophil', 'Mature red blood cell'],
        answer,
        explanation: 'Because of **steroids**.',
        time: 465,
        stats: {answered: 12, correct: 10},
        mine,
    };
}

function aids(changes: Partial<StudyAids> = {}): StudyAids {
    return {
        video_id: 7,
        can_edit: false,
        can_manage: false,
        generation: 'ready',
        has_transcript: false,
        my_ticks: null,
        summary: {markdown: MARKDOWN, revision: 1, origin: 'ai', edited: false, contributors: [], updated_at: null, verified: null},
        quiz: null,
        ...changes,
    };
}

function quiz(questions: QuizQuestion[]): StudyAids['quiz'] {
    return {questions, revision: 2, origin: 'ai', edited: true, contributors: [{name: 'Kan & Chain'}], updated_at: null, verified: null};
}

describe('LectureStudyAidsComponent', () => {
    let fixture: ComponentFixture<LectureStudyAidsComponent>;
    let service: jasmine.SpyObj<Pick<StudyAidsService, 'watch' | 'refresh' | 'answer' | 'transcript' | 'retryTranscript' | 'profile' | 'saveTicks'>>;
    let seek: jasmine.Spy;
    let query: Record<string, string>;
    /** How the reader answers the question before an unfinished quiz is cleared. */
    let redoChoice: string;

    const element = () => fixture.nativeElement as HTMLElement;
    const text = () => element().textContent?.replace(/\s+/g, ' ') ?? '';
    const buttons = (selector: string) => Array.from(element().querySelectorAll<HTMLElement>(selector));
    const clickButton = (label: string) => {
        const button = buttons('ion-button, button').find(candidate => candidate.textContent?.trim() === label);
        expect(button).withContext(label).toBeTruthy();
        button?.click();
        fixture.detectChanges();
    };
    const tabs = () => buttons('ion-segment-button').map(button => button.textContent?.trim());
    const openTab = (tab: string) => {
        const segment = element().querySelector('ion-segment');
        segment?.dispatchEvent(new CustomEvent('ionChange', {detail: {value: tab}}));
        fixture.detectChanges();
    };

    function create(state: StudyAidsState): void {
        service.watch.and.returnValue(new BehaviorSubject(state));
        fixture = TestBed.createComponent(LectureStudyAidsComponent);
        fixture.componentRef.setInput('video', VIDEO);
        fixture.componentRef.setInput('playback', {currentTime: () => 0, seek});
        fixture.detectChanges();
    }

    beforeEach(() => {
        for (const key of ['flickSummaryTicks:7', 'flickQuizAnswers:7', 'flickStudyAidsCollapsed', 'flickStudyAidsTab', 'flickSummaryTicksUnsynced']) {
            localStorage.removeItem(key);
        }
        service = jasmine.createSpyObj('StudyAidsService', ['watch', 'refresh', 'answer', 'transcript', 'retryTranscript', 'profile', 'saveTicks']);
        service.saveTicks.and.callFake((videoId, ticks) => of(ticks));
        service.answer.and.returnValue(of({answered: 13, correct: 11}));
        service.profile.and.returnValue(of(null));
        service.transcript.and.returnValue(of<TranscriptState>({status: 'ready', paragraphs: [
            {time: 5, text: 'สวัสดีครับ วันนี้เราจะคุยเรื่อง organelles'},
            {time: 70, text: 'The smooth ER stores Ca²⁺.'},
        ]}));
        seek = jasmine.createSpy('seek');
        query = {};
        redoChoice = 'confirm';
        TestBed.configureTestingModule({
            imports: [LectureStudyAidsComponent],
            providers: [
                {provide: StudyAidsService, useValue: service},
                {provide: ActivatedRoute, useValue: {snapshot: {get queryParamMap() {
                    return convertToParamMap(query);
                }}}},
                {provide: ModalController, useValue: jasmine.createSpyObj('ModalController', ['create'])},
                {provide: AlertController, useValue: {create: () => Promise.resolve({
                    present: () => Promise.resolve(),
                    onDidDismiss: () => Promise.resolve({role: redoChoice}),
                })}},
            ],
        });
    });

    afterEach(() => {
        for (const key of ['flickSummaryTicks:7', 'flickQuizAnswers:7', 'flickStudyAidsCollapsed', 'flickStudyAidsTab', 'flickSummaryTicksUnsynced']) {
            localStorage.removeItem(key);
        }
    });

    describe('summary', () => {
        it('shows the AI draft as a numbered checklist', () => {
            create({status: 'ready', aids: aids()});

            expect(text()).toContain('Summary & Transcription');
            expect(text()).toContain('AI draft');
            expect(text()).toContain('Not verified by an editor yet.');
            expect(Array.from(element().querySelectorAll('.point-number')).map(number => number.textContent)).toEqual(['1.', '2.']);
            expect(element().querySelector('ion-segment')).toBeNull();
        });

        it('jumps the lecture to a section', () => {
            create({status: 'ready', aids: aids()});
            element().querySelector<HTMLButtonElement>('button.time-chip')?.click();

            expect(seek).toHaveBeenCalledWith(70);
        });

        it('remembers ticked points on this device', () => {
            create({status: 'ready', aids: aids()});
            const box = element().querySelector<HTMLInputElement>('.point-tick');
            box!.checked = true;
            box!.dispatchEvent(new Event('change'));
            fixture.detectChanges();

            expect(text()).toContain('1 of 2 points ticked.');
            expect(text()).toContain('1/2 ticked');
            expect(JSON.parse(localStorage.getItem('flickSummaryTicks:7') ?? '[]').length).toBe(1);
        });

        it('names the editors who chose to be credited and who verified it', () => {
            create({status: 'ready', aids: aids({summary: {
                ...aids().summary!,
                origin: 'editor',
                edited: true,
                revision: 3,
                contributors: [{name: 'Kan'}, {name: 'Chain'}],
                verified: {revision: 3, by: [{name: 'Ajarn Dev'}], at: '2026-10-09T16:52:22+00:00'},
            }})});

            expect(text()).toContain('By Kan and Chain');
            expect(text()).toContain('Verified by Ajarn Dev.');
            expect(element().querySelector('.card-badge')?.textContent).toBe('Verified');
        });

        it('shows nothing when there is nothing for a reader', () => {
            create({status: 'ready', aids: aids({summary: null})});

            expect(element().querySelector('ion-card')).toBeNull();
        });

        it('shows nothing when the server has no study aids', () => {
            create({status: 'unavailable'});

            expect(element().querySelector('ion-card')).toBeNull();
        });

        it('tells readers a summary is on its way', () => {
            create({status: 'ready', aids: aids({summary: null, generation: 'pending'})});

            expect(text()).toContain('The AI is still writing a summary of this lecture.');
        });

        it('lets editors write one', () => {
            create({status: 'ready', aids: aids({summary: null, can_edit: true})});

            expect(text()).toContain('Write a summary');
        });
    });

    describe('tabs', () => {
        it('offers the transcription when there is one, and remembers the tab chosen', () => {
            create({status: 'ready', aids: aids({has_transcript: true, quiz: quiz([question('a', 2)])})});

            expect(tabs()).toEqual(['Summary', 'Transcription', 'Quiz']);
            openTab('transcript');

            expect(service.transcript).toHaveBeenCalledWith(7);
            expect(text()).toContain('The smooth ER stores Ca²⁺.');
            expect(localStorage.getItem('flickStudyAidsTab')).toBe('"transcript"');
            buttons('.transcript-paragraph button.time-chip')[1].click();
            expect(seek).toHaveBeenCalledWith(70);
        });

        it('opens on the first tab with something in it', () => {
            localStorage.setItem('flickStudyAidsTab', '"quiz"');
            create({status: 'ready', aids: aids({has_transcript: true})});

            expect(tabs()).toEqual(['Summary', 'Transcription']);
            expect(element().querySelector('app-summary-body')).not.toBeNull();
        });

        it('shows the transcription alone when there is nothing else yet', () => {
            create({status: 'ready', aids: aids({summary: null, has_transcript: true})});

            expect(element().querySelector('ion-segment')).toBeNull();
            expect(element().querySelector('app-transcript-body')).not.toBeNull();
        });
    });

    describe('quiz', () => {
        const createQuiz = (questions: QuizQuestion[], canEdit = false) => {
            localStorage.setItem('flickStudyAidsTab', '"quiz"');
            create({status: 'ready', aids: aids({summary: null, can_edit: canEdit, quiz: quiz(questions)})});
        };

        it('offers to start, then shows the first question', () => {
            createQuiz([question('a', 2), question('b', 0)]);

            expect(text()).toContain('2 single-best-answer questions');
            expect(text()).toContain('AI draft, edited by Kan & Chain');
            clickButton('Start quiz');

            expect(text()).toContain('Question 1 of 2');
            expect(buttons('.quiz-choice').length).toBe(5);
        });

        it('marks the answer, explains it and records it once', () => {
            createQuiz([question('a', 2), question('b', 0)]);
            clickButton('Start quiz');
            buttons('.quiz-choice')[1].click();
            fixture.detectChanges();

            expect(buttons('.quiz-choice.is-wrong').length).toBe(1);
            expect(buttons('.quiz-choice.is-correct').length).toBe(1);
            expect(text()).toContain('Not quite. The answer is C.');
            expect(text()).toContain('83% of 12 students got this right.');
            expect(service.answer).toHaveBeenCalledOnceWith(7, 'a', 1);

            buttons('.quiz-choice')[2].click();
            fixture.detectChanges();
            expect(service.answer).toHaveBeenCalledTimes(1);
        });

        it('jumps the lecture to where the question is taught', () => {
            createQuiz([question('a', 2)]);
            clickButton('Start quiz');
            buttons('.quiz-choice')[0].click();
            fixture.detectChanges();
            clickButton('Watch this part (7:45)');

            expect(seek).toHaveBeenCalledWith(465);
        });

        it('scores the quiz and lets the reader start again', async () => {
            createQuiz([question('a', 2), question('b', 0)]);
            clickButton('Start quiz');
            buttons('.quiz-choice')[2].click();
            fixture.detectChanges();
            clickButton('Next question');
            buttons('.quiz-choice')[3].click();
            fixture.detectChanges();
            clickButton('See results');

            expect(text()).toContain('1 of 2 correct');
            expect(text()).toContain('1/2 correct');
            clickButton('Redo quiz');
            await fixture.whenStable();
            fixture.detectChanges();
            expect(text()).toContain('Question 1 of 2');
            expect(buttons('.quiz-choice.is-correct').length).toBe(0);
        });

        it('lets the reader redo an unfinished quiz once they confirm', async () => {
            localStorage.setItem('flickQuizAnswers:7', JSON.stringify({a: 2}));
            createQuiz([question('a', 2), question('b', 0)]);
            redoChoice = 'cancel';
            clickButton('Redo quiz');
            await fixture.whenStable();
            fixture.detectChanges();
            expect(text()).toContain('You have answered 1 so far.');

            redoChoice = 'confirm';
            clickButton('Redo quiz');
            await fixture.whenStable();
            fixture.detectChanges();
            expect(text()).toContain('Question 1 of 2');
            expect(buttons('.quiz-choice.is-correct').length).toBe(0);
            expect(JSON.parse(localStorage.getItem('flickQuizAnswers:7') ?? 'null')).toEqual({});
        });

        it('offers to redo the quiz from a question once one is answered', async () => {
            createQuiz([question('a', 2), question('b', 0)]);
            clickButton('Start quiz');
            expect(text()).not.toContain('Redo quiz');

            buttons('.quiz-choice')[2].click();
            fixture.detectChanges();
            clickButton('Next question');
            clickButton('Redo quiz');
            await fixture.whenStable();
            fixture.detectChanges();
            expect(text()).toContain('Question 1 of 2');
            expect(buttons('.quiz-choice.is-correct').length).toBe(0);
        });

        it('starts from the answers given on another device', () => {
            createQuiz([question('a', 2, 2), question('b', 0, 1)]);

            expect(text()).toContain('1 of 2 correct');
            expect(service.answer).not.toHaveBeenCalled();
        });

        it('carries on where this device left off', () => {
            localStorage.setItem('flickQuizAnswers:7', JSON.stringify({a: 2}));
            createQuiz([question('a', 2), question('b', 0)]);

            expect(text()).toContain('You have answered 1 so far.');
            clickButton('Continue');
            expect(text()).toContain('Question 2 of 2');
        });

        it('offers editors to add questions', () => {
            createQuiz([], true);

            expect(text()).toContain('There are no questions for this lecture yet.');
            expect(text()).toContain('Add questions');
        });

        it('builds a link that opens this lecture\'s quiz', () => {
            createQuiz([question('a', 2)]);
            const body = fixture.debugElement.query(By.directive(QuizBodyComponent)).componentInstance as QuizBodyComponent;
            const link = new URL(body.shareLink());

            expect(link.searchParams.get('video')).toBe('7');
            expect(link.searchParams.get('quiz')).toBe('1');
        });

        it('opens on the quiz when the page was reached through its link', () => {
            localStorage.setItem('flickStudyAidsCollapsed', 'true');
            query = {video: '7', quiz: '1'};
            create({status: 'ready', aids: aids({quiz: quiz([question('a', 2)])})});

            expect(text()).toContain('Start quiz');
            expect(localStorage.getItem('flickStudyAidsCollapsed')).toBe('true');
        });

        it('stays folded away for a link to another lecture', () => {
            localStorage.setItem('flickStudyAidsCollapsed', 'true');
            query = {video: '8', quiz: '1'};
            create({status: 'ready', aids: aids({quiz: quiz([question('a', 2)])})});

            expect(text()).not.toContain('Start quiz');
        });
    });
});
