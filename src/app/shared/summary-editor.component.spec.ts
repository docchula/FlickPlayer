import {ComponentFixture, TestBed} from '@angular/core/testing';
import {AlertController, ModalController} from '@ionic/angular';
import {BehaviorSubject, of} from 'rxjs';
import {SummaryEditorComponent} from './summary-editor.component';
import {StudyAidsService} from '../study-aids.service';
import {AuthService} from '../auth.service';

const IMAGE_URL = 'https://flick-man-app.docchula.com/v1/study_aids/images/01M4D7B2STKMV08W6Z0ZF3G56N.png';

function pngFile(): Promise<File> {
    const canvas = document.createElement('canvas');
    canvas.width = 20;
    canvas.height = 10;

    return new Promise(resolve => canvas.toBlob(blob => resolve(new File([blob as Blob], 'Golgi.png', {type: 'image/png'})), 'image/png'));
}

describe('SummaryEditorComponent', () => {
    let fixture: ComponentFixture<SummaryEditorComponent>;
    let service: jasmine.SpyObj<Pick<StudyAidsService, 'uploadImage' | 'saveSummary' | 'profile'>>;

    const textarea = () => (fixture.nativeElement as HTMLElement).querySelector('textarea') as HTMLTextAreaElement;
    const pick = async (file: File) => {
        const picker = (fixture.nativeElement as HTMLElement).querySelector('input[type=file]') as HTMLInputElement;
        Object.defineProperty(picker, 'files', {value: [file], configurable: true});
        await (fixture.componentInstance as unknown as {onImagePicked(event: Event): Promise<void>}).onImagePicked({target: picker} as unknown as Event);
        fixture.detectChanges();
        await fixture.whenStable();
    };

    beforeEach(() => {
        service = jasmine.createSpyObj('StudyAidsService', ['uploadImage', 'saveSummary', 'profile']);
        service.profile.and.returnValue(of(null));
        TestBed.configureTestingModule({
            imports: [SummaryEditorComponent],
            providers: [
                {provide: StudyAidsService, useValue: service},
                {provide: AuthService, useValue: {user: new BehaviorSubject(null)}},
                {provide: ModalController, useValue: jasmine.createSpyObj('ModalController', ['dismiss'])},
                {provide: AlertController, useValue: jasmine.createSpyObj('AlertController', ['create'])},
            ],
        });
        fixture = TestBed.createComponent(SummaryEditorComponent);
        fixture.componentRef.setInput('videoId', 7);
        fixture.componentRef.setInput('summary', {
            markdown: '## Golgi\n\n1. Point', revision: 3, origin: 'ai', edited: false, contributors: [], updated_at: null,
        });
        fixture.detectChanges();
    });

    it('uploads a picked image and puts it where the cursor was', async () => {
        service.uploadImage.and.returnValue(of({url: IMAGE_URL, width: 20, height: 10}));
        // ngModel fills the textarea after the first render, which would move the cursor.
        await fixture.whenStable();
        textarea().setSelectionRange(8, 8);
        await pick(await pngFile());

        expect(service.uploadImage).toHaveBeenCalledWith(7, jasmine.any(Blob), 'Golgi.png');
        expect(textarea().value).toBe('## Golgi\n![Golgi](' + IMAGE_URL + ')\n\n\n1. Point');
    });

    it('says why an image was refused and leaves the text alone', async () => {
        await pick(new File(['x'], 'scan.heic', {type: 'image/heic'}));

        expect(service.uploadImage).not.toHaveBeenCalled();
        expect((fixture.nativeElement as HTMLElement).querySelector('.editor-problem')?.textContent).toContain('PNG, JPEG, WebP or GIF');
        expect(textarea().value).toBe('## Golgi\n\n1. Point');
    });
});
