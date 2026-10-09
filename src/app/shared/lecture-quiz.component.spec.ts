import {ComponentFixture, TestBed} from '@angular/core/testing';
import {By} from '@angular/platform-browser';
import {ActivatedRoute, convertToParamMap} from '@angular/router';
import {ModalController} from '@ionic/angular/standalone';
import {BehaviorSubject, of} from 'rxjs';
import {LectureQuizComponent} from './lecture-quiz.component';
import {QuizBodyComponent} from './quiz-body.component';
import {StudyAidsService} from '../study-aids.service';
import {Lecture} from '../man.service';
import {QuizQuestion, StudyAids, StudyAidsState} from '../study-aids/study-aids.model';

const VIDEO = {id: 7, title: 'Organelles', duration: 3000} as Lecture;

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

function aids(questions: QuizQuestion[], canEdit = false): StudyAids {
    return {
        video_id: 7,
        can_edit: canEdit,
        can_manage: false,
        generation: 'ready',
        summary: null,
        quiz: {questions, revision: 2, origin: 'ai', edited: true, contributors: [{name: 'Kan & Chain'}], updated_at: null},
    };
}

describe('LectureQuizComponent', () => {
    let fixture: ComponentFixture<LectureQuizComponent>;
    let state$: BehaviorSubject<StudyAidsState>;
    let service: jasmine.SpyObj<Pick<StudyAidsService, 'watch' | 'answer' | 'refresh'>>;
    let seek: jasmine.Spy;
    let query: Record<string, string>;

    const element = () => fixture.nativeElement as HTMLElement;
    const text = () => element().textContent?.replace(/\s+/g, ' ') ?? '';
    const buttons = (selector: string) => Array.from(element().querySelectorAll<HTMLElement>(selector));
    const clickButton = (label: string) => {
        const button = buttons('ion-button, button').find(candidate => candidate.textContent?.trim() === label);
        expect(button).withContext(label).toBeTruthy();
        button?.click();
        fixture.detectChanges();
    };

    function create(initial: StudyAids): void {
        state$ = new BehaviorSubject<StudyAidsState>({status: 'ready', aids: initial});
        service.watch.and.returnValue(state$);
        fixture = TestBed.createComponent(LectureQuizComponent);
        fixture.componentRef.setInput('video', VIDEO);
        fixture.componentRef.setInput('playback', {currentTime: () => 0, seek});
        fixture.detectChanges();
    }

    beforeEach(() => {
        localStorage.removeItem('flickQuizAnswers:7');
        localStorage.removeItem('flickStudyAidsCollapsed');
        service = jasmine.createSpyObj('StudyAidsService', ['watch', 'answer', 'refresh']);
        service.answer.and.returnValue(of({answered: 13, correct: 11}));
        seek = jasmine.createSpy('seek');
        query = {};
        TestBed.configureTestingModule({
            imports: [LectureQuizComponent],
            providers: [
                {provide: StudyAidsService, useValue: service},
                {provide: ActivatedRoute, useValue: {snapshot: {get queryParamMap() {
                    return convertToParamMap(query);
                }}}},
                {provide: ModalController, useValue: jasmine.createSpyObj('ModalController', ['create'])},
            ],
        });
    });

    afterEach(() => {
        localStorage.removeItem('flickQuizAnswers:7');
    });

    it('offers to start, then shows the first question', () => {
        create(aids([question('a', 2), question('b', 0)]));

        expect(text()).toContain('2 single-best-answer questions');
        expect(text()).toContain('AI draft, edited by Kan & Chain');
        clickButton('Start quiz');

        expect(text()).toContain('Question 1 of 2');
        expect(buttons('.quiz-choice').length).toBe(5);
    });

    it('marks the answer, explains it and records it once', () => {
        create(aids([question('a', 2), question('b', 0)]));
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
        create(aids([question('a', 2)]));
        clickButton('Start quiz');
        buttons('.quiz-choice')[0].click();
        fixture.detectChanges();
        clickButton('Watch this part (7:45)');

        expect(seek).toHaveBeenCalledWith(465);
    });

    it('scores the quiz and lets the reader start again', () => {
        create(aids([question('a', 2), question('b', 0)]));
        clickButton('Start quiz');
        buttons('.quiz-choice')[2].click();
        fixture.detectChanges();
        clickButton('Next question');
        buttons('.quiz-choice')[3].click();
        fixture.detectChanges();
        clickButton('See results');

        expect(text()).toContain('1 of 2 correct');
        clickButton('Retake quiz');
        expect(text()).toContain('Question 1 of 2');
        expect(buttons('.quiz-choice.is-correct').length).toBe(0);
    });

    it('starts from the answers given on another device', () => {
        create(aids([question('a', 2, 2), question('b', 0, 1)]));

        expect(text()).toContain('1 of 2 correct');
        expect(service.answer).not.toHaveBeenCalled();
    });

    it('carries on where this device left off', () => {
        localStorage.setItem('flickQuizAnswers:7', JSON.stringify({a: 2}));
        create(aids([question('a', 2), question('b', 0)]));

        expect(text()).toContain('You have answered 1 so far.');
        clickButton('Continue');
        expect(text()).toContain('Question 2 of 2');
    });

    it('stays hidden from readers when a lecture has no questions', () => {
        create(aids([]));

        expect(element().querySelector('ion-card')).toBeNull();
    });

    it('offers editors to add questions', () => {
        create(aids([], true));

        expect(text()).toContain('There are no questions for this lecture yet.');
        expect(text()).toContain('Add questions');
    });

    it('builds a link that opens this lecture\'s quiz', () => {
        create(aids([question('a', 2)]));
        const body = fixture.debugElement.query(By.directive(QuizBodyComponent)).componentInstance as QuizBodyComponent;
        const link = new URL(body.shareLink());

        expect(link.searchParams.get('video')).toBe('7');
        expect(link.searchParams.get('quiz')).toBe('1');
    });

    it('opens the quiz when the page was reached through its link', () => {
        localStorage.setItem('flickStudyAidsCollapsed', JSON.stringify({quiz: true}));
        query = {video: '7', quiz: '1'};
        create(aids([question('a', 2)]));

        expect(text()).toContain('Start quiz');
        expect(JSON.parse(localStorage.getItem('flickStudyAidsCollapsed') ?? '{}').quiz).toBeTrue();
    });

    it('stays folded away for a link to another lecture', () => {
        localStorage.setItem('flickStudyAidsCollapsed', JSON.stringify({quiz: true}));
        query = {video: '8', quiz: '1'};
        create(aids([question('a', 2)]));

        expect(text()).not.toContain('Start quiz');
    });
});
