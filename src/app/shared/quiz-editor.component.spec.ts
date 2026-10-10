import {ComponentFixture, TestBed} from '@angular/core/testing';
import {AlertController, ModalController} from '@ionic/angular';
import {BehaviorSubject, of} from 'rxjs';
import {QuizEditorComponent} from './quiz-editor.component';
import {StudyAidsService} from '../study-aids.service';
import {AuthService} from '../auth.service';
import {DRIVE_IMAGE_CHECK} from '../study-aids/image-link';
import {QuestionForm} from '../study-aids/quiz';

const ID = '1AbCdEfGhIjKlMnOpQrStUvWxYz012345';

describe('QuizEditorComponent', () => {
    let fixture: ComponentFixture<QuizEditorComponent>;
    let service: jasmine.SpyObj<Pick<StudyAidsService, 'saveQuiz' | 'profile'>>;
    let pasted: {link: string; description: string};
    let readersCanSee: boolean;

    const editor = () => fixture.componentInstance as unknown as {
        forms: QuestionForm[];
        previewing: Set<number>;
        problem: string | null;
        addImage(form: QuestionForm, field: 'prompt' | 'explanation'): Promise<void>;
    };

    beforeEach(() => {
        service = jasmine.createSpyObj('StudyAidsService', ['saveQuiz', 'profile']);
        service.profile.and.returnValue(of(null));
        pasted = {link: `https://drive.google.com/file/d/${ID}/view?usp=sharing`, description: 'Cell'};
        readersCanSee = true;
        TestBed.configureTestingModule({
            imports: [QuizEditorComponent],
            providers: [
                {provide: StudyAidsService, useValue: service},
                {provide: AuthService, useValue: {user: new BehaviorSubject(null)}},
                {provide: ModalController, useValue: jasmine.createSpyObj('ModalController', ['dismiss'])},
                {provide: AlertController, useValue: {create: () => Promise.resolve({
                    present: () => Promise.resolve(),
                    onDidDismiss: () => Promise.resolve({role: 'confirm', data: {values: pasted}}),
                })}},
                {provide: DRIVE_IMAGE_CHECK, useValue: () => Promise.resolve(readersCanSee)},
            ],
        });
        fixture = TestBed.createComponent(QuizEditorComponent);
        fixture.componentRef.setInput('videoId', 7);
        fixture.componentRef.setInput('quiz', {
            questions: [{id: 'a', prompt: 'Which cell?', choices: ['A', 'B'], answer: 0, explanation: null, time: null, stats: null, mine: null}],
            revision: 1, origin: 'ai', edited: false, contributors: [], updated_at: null, verified: null,
        });
        fixture.detectChanges();
    });

    it('adds a Google Drive picture under the question and shows the preview', async () => {
        const form = editor().forms[0];
        await editor().addImage(form, 'prompt');
        fixture.detectChanges();

        expect(form.prompt).toBe(`Which cell?\n\n![Cell](https://drive.google.com/file/d/${ID}/view)`);
        expect(editor().previewing.has(form.key)).toBeTrue();
        expect((fixture.nativeElement as HTMLElement).querySelector('.question-preview a.drive-image')?.getAttribute('href'))
            .toBe(`https://drive.google.com/file/d/${ID}/view`);
    });

    it('says why a picture cannot be added and leaves the question alone', async () => {
        const form = editor().forms[0];
        pasted = {link: 'https://example.com/cell.png', description: ''};
        await editor().addImage(form, 'prompt');
        expect(editor().problem).toContain('not a Google Drive link');

        pasted = {link: `https://drive.google.com/open?id=${ID}`, description: ''};
        readersCanSee = false;
        await editor().addImage(form, 'explanation');
        expect(editor().problem).toContain('share it as "Anyone with the link"');
        expect(form.prompt).toBe('Which cell?');
        expect(form.explanation).toBe('');
    });
});
