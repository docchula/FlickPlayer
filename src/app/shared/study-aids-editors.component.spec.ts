import {ComponentFixture, TestBed} from '@angular/core/testing';
import {AlertController, ModalController} from '@ionic/angular';
import {BehaviorSubject, of} from 'rxjs';
import {StudyAidsEditorsComponent} from './study-aids-editors.component';
import {StudyAidsService} from '../study-aids.service';
import {AuthService} from '../auth.service';
import {StudyAidsEditor} from '../study-aids/study-aids.model';

const ME: StudyAidsEditor = {email: 'me@docchula.com', name: 'Me', role: 'admin', added_at: null};
const KAN: StudyAidsEditor = {email: 'kan@docchula.com', name: 'Kan', role: 'editor', added_at: null};

describe('StudyAidsEditorsComponent', () => {
    let fixture: ComponentFixture<StudyAidsEditorsComponent>;
    let service: jasmine.SpyObj<Pick<StudyAidsService, 'editors' | 'saveEditor' | 'removeEditor' | 'refresh'>>;
    let alertRole: string;

    const text = () => (fixture.nativeElement as HTMLElement).textContent?.replace(/\s+/g, ' ') ?? '';
    const component = () => fixture.componentInstance as unknown as {
        email: string;
        add(event: Event): Promise<void>;
        remove(editor: StudyAidsEditor): Promise<void>;
    };

    beforeEach(async () => {
        service = jasmine.createSpyObj('StudyAidsService', ['editors', 'saveEditor', 'removeEditor', 'refresh']);
        service.editors.and.returnValue(of([KAN, ME]));
        alertRole = 'destructive';
        TestBed.configureTestingModule({
            imports: [StudyAidsEditorsComponent],
            providers: [
                {provide: StudyAidsService, useValue: service},
                {provide: AuthService, useValue: {user: new BehaviorSubject({email: 'Me@docchula.com'})}},
                {provide: ModalController, useValue: jasmine.createSpyObj('ModalController', ['dismiss'])},
                {
                    provide: AlertController,
                    useValue: {create: () => Promise.resolve({present: () => Promise.resolve(), onDidDismiss: () => Promise.resolve({role: alertRole})})},
                },
            ],
        });
        fixture = TestBed.createComponent(StudyAidsEditorsComponent);
        fixture.componentRef.setInput('videoId', 7);
        fixture.detectChanges();
        await fixture.whenStable();
        fixture.detectChanges();
    });

    it('lists admins first and marks the reader', () => {
        const names = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('ion-item h3')).map(h => h.textContent?.trim());

        expect(names[0]).toContain('Me');
        expect(names[0]).toContain('(you)');
        expect(names[1]).toBe('Kan');
    });

    it('only adds Docchula addresses', async () => {
        component().email = 'someone@gmail.com';
        await component().add(new Event('submit'));
        fixture.detectChanges();

        expect(service.saveEditor).not.toHaveBeenCalled();
        expect(text()).toContain('Enter their @docchula.com address.');
    });

    it('adds an editor by email', async () => {
        service.saveEditor.and.returnValue(of({email: 'new@docchula.com', name: null, role: 'editor', added_at: null}));
        component().email = ' New@Docchula.com ';
        await component().add(new Event('submit'));
        fixture.detectChanges();

        expect(service.saveEditor).toHaveBeenCalledWith('new@docchula.com', 'editor');
        expect(text()).toContain('new@docchula.com');
        expect(service.refresh).not.toHaveBeenCalled();
    });

    it('removes an editor once confirmed', async () => {
        service.removeEditor.and.returnValue(of(true as const));
        await component().remove(KAN);
        fixture.detectChanges();

        expect(service.removeEditor).toHaveBeenCalledWith('kan@docchula.com');
        expect(text()).not.toContain('Kan');
    });

    it('keeps an editor when the removal is cancelled', async () => {
        alertRole = 'cancel';
        await component().remove(KAN);

        expect(service.removeEditor).not.toHaveBeenCalled();
    });

    it('reloads the reader\'s own permissions after removing themself', async () => {
        service.removeEditor.and.returnValue(of(true as const));
        await component().remove(ME);

        expect(service.refresh).toHaveBeenCalledWith(7);
    });
});
