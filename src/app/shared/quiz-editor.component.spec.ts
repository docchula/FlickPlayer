import {ComponentFixture, TestBed} from '@angular/core/testing';
import {AlertController, ModalController} from '@ionic/angular/standalone';
import {BehaviorSubject, of} from 'rxjs';
import {QuizEditorComponent} from './quiz-editor.component';
import {StudyAidsService} from '../study-aids.service';
import {AuthService} from '../auth.service';
import {QuestionForm} from '../study-aids/quiz';

const IMAGE_URL = 'https://flick-man-app.docchula.com/v1/study_aids/images/01M4D7B2STKMV08W6Z0ZF3G56N.png';

describe('QuizEditorComponent', () => {
    let fixture: ComponentFixture<QuizEditorComponent>;
    let service: jasmine.SpyObj<Pick<StudyAidsService, 'uploadImage' | 'saveQuiz'>>;

    const editor = () => fixture.componentInstance as unknown as {
        forms: QuestionForm[];
        previewing: Set<number>;
        pickImage(form: QuestionForm, field: 'prompt' | 'explanation'): void;
        onImagePicked(event: Event): Promise<void>;
    };

    beforeEach(() => {
        service = jasmine.createSpyObj('StudyAidsService', ['uploadImage', 'saveQuiz']);
        TestBed.configureTestingModule({
            imports: [QuizEditorComponent],
            providers: [
                {provide: StudyAidsService, useValue: service},
                {provide: AuthService, useValue: {user: new BehaviorSubject(null)}},
                {provide: ModalController, useValue: jasmine.createSpyObj('ModalController', ['dismiss'])},
                {provide: AlertController, useValue: jasmine.createSpyObj('AlertController', ['create'])},
            ],
        });
        fixture = TestBed.createComponent(QuizEditorComponent);
        fixture.componentRef.setInput('videoId', 7);
        fixture.componentRef.setInput('quiz', {
            questions: [{id: 'a', prompt: 'Which cell?', choices: ['A', 'B'], answer: 0, explanation: null, time: null, stats: null, mine: null}],
            revision: 1, origin: 'ai', edited: false, contributors: [], updated_at: null,
        });
        fixture.detectChanges();
    });

    it('adds an uploaded image under the question and shows the preview', async () => {
        service.uploadImage.and.returnValue(of({url: IMAGE_URL, width: 20, height: 10}));
        const picker = (fixture.nativeElement as HTMLElement).querySelector('input[type=file]') as HTMLInputElement;
        spyOn(picker, 'click');
        const form = editor().forms[0];
        editor().pickImage(form, 'prompt');
        Object.defineProperty(picker, 'files', {value: [new File(['x'], 'Cell.gif', {type: 'image/gif'})], configurable: true});
        await editor().onImagePicked({target: picker} as unknown as Event);
        fixture.detectChanges();

        expect(picker.click).toHaveBeenCalled();
        expect(form.prompt).toBe('Which cell?\n\n![Cell](' + IMAGE_URL + ')');
        expect(editor().previewing.has(form.key)).toBeTrue();
        expect((fixture.nativeElement as HTMLElement).querySelector('.question-preview img')?.getAttribute('src')).toBe(IMAGE_URL);
    });
});
