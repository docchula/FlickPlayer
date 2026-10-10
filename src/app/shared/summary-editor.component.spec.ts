import {ComponentFixture, TestBed} from '@angular/core/testing';
import {AlertController, ModalController} from '@ionic/angular';
import {BehaviorSubject, of} from 'rxjs';
import {SummaryEditorComponent} from './summary-editor.component';
import {StudyAidsService} from '../study-aids.service';
import {AuthService} from '../auth.service';
import {DRIVE_IMAGE_CHECK} from '../study-aids/image-link';

const ID = '1AbCdEfGhIjKlMnOpQrStUvWxYz012345';

describe('SummaryEditorComponent', () => {
    let fixture: ComponentFixture<SummaryEditorComponent>;
    let service: jasmine.SpyObj<Pick<StudyAidsService, 'saveSummary' | 'profile'>>;
    let pasted: {link: string; description: string};
    let readersCanSee: boolean;

    const textarea = () => (fixture.nativeElement as HTMLElement).querySelector('textarea') as HTMLTextAreaElement;
    const addImage = async () => {
        await (fixture.componentInstance as unknown as {addImage(): Promise<void>}).addImage();
        fixture.detectChanges();
        await fixture.whenStable();
    };

    beforeEach(() => {
        service = jasmine.createSpyObj('StudyAidsService', ['saveSummary', 'profile']);
        service.profile.and.returnValue(of(null));
        pasted = {link: `https://drive.google.com/file/d/${ID}/view?usp=sharing`, description: 'Golgi'};
        readersCanSee = true;
        TestBed.configureTestingModule({
            imports: [SummaryEditorComponent],
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
        fixture = TestBed.createComponent(SummaryEditorComponent);
        fixture.componentRef.setInput('videoId', 7);
        fixture.componentRef.setInput('summary', {
            markdown: '## Golgi\n\n1. Point', revision: 3, origin: 'ai', edited: false, contributors: [], updated_at: null, verified: null,
        });
        fixture.detectChanges();
    });

    it('puts a Google Drive picture where the cursor was', async () => {
        // ngModel fills the textarea after the first render, which would move the cursor.
        await fixture.whenStable();
        textarea().setSelectionRange(8, 8);
        await addImage();

        expect(textarea().value).toBe(`## Golgi\n![Golgi](https://drive.google.com/file/d/${ID}/view)\n\n\n1. Point`);
    });

    it('says why a picture cannot be added and leaves the text alone', async () => {
        readersCanSee = false;
        await addImage();

        expect((fixture.nativeElement as HTMLElement).querySelector('.editor-problem')?.textContent).toContain('Anyone with the link');
        expect(textarea().value).toBe('## Golgi\n\n1. Point');
    });
});
