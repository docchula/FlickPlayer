import {ComponentFixture, TestBed} from '@angular/core/testing';
import {AlertController} from '@ionic/angular/standalone';
import {of} from 'rxjs';
import {VerificationComponent} from './verification.component';
import {StudyAidsService} from '../study-aids.service';
import {PartMeta} from '../study-aids/study-aids.model';

const PART: PartMeta = {revision: 2, origin: 'ai', edited: true, contributors: [], updated_at: null, verified: null};

describe('VerificationComponent', () => {
    let fixture: ComponentFixture<VerificationComponent>;
    let service: jasmine.SpyObj<Pick<StudyAidsService, 'verify' | 'profile'>>;
    let confirm: string;

    const element = () => fixture.nativeElement as HTMLElement;
    const text = () => element().textContent?.replace(/\s+/g, ' ').trim() ?? '';

    function create(part: PartMeta, canEdit: boolean): void {
        fixture = TestBed.createComponent(VerificationComponent);
        fixture.componentRef.setInput('videoId', 7);
        fixture.componentRef.setInput('part', part);
        fixture.componentRef.setInput('name', 'summary');
        fixture.componentRef.setInput('canEdit', canEdit);
        fixture.detectChanges();
    }

    beforeEach(() => {
        service = jasmine.createSpyObj('StudyAidsService', ['verify', 'profile']);
        service.verify.and.returnValue(of({...PART, markdown: ''}));
        service.profile.and.returnValue(of({name: 'Ajarn Dev', changed_at: null, next_change_at: null}));
        confirm = 'confirm';
        TestBed.configureTestingModule({
            imports: [VerificationComponent],
            providers: [
                {provide: StudyAidsService, useValue: service},
                {provide: AlertController, useValue: {create: () => Promise.resolve({
                    present: () => Promise.resolve(),
                    onDidDismiss: () => Promise.resolve({role: confirm}),
                })}},
            ],
        });
    });

    it('tells students when nobody has checked the AI draft', () => {
        create(PART, false);

        expect(text()).toBe('Not verified by an editor yet.');
        expect(service.profile).not.toHaveBeenCalled();
    });

    it('names who verified the version on show', () => {
        create({...PART, verified: {revision: 2, by: [{name: 'Kan'}, {name: 'Chain'}], at: '2026-10-09T16:52:22+00:00'}}, false);

        expect(text()).toBe('Verified by Kan and Chain.');
        expect(element().querySelector('.verification')?.classList).toContain('is-verified');
    });

    it('says so when the version verified is an older one', () => {
        create({...PART, verified: {revision: 1, by: [{name: 'Kan'}], at: null}}, true);

        expect(text()).toContain('Verified by Kan before the latest changes.');
        expect(text()).toContain('Verify this version');
    });

    it('lets an editor verify after confirming', async () => {
        create(PART, true);
        element().querySelector<HTMLElement>('ion-button')?.click();
        await fixture.whenStable();

        expect(service.verify).toHaveBeenCalledOnceWith(7, 'summary', 2, true);
    });

    it('does nothing when the editor thinks better of it', async () => {
        confirm = 'cancel';
        create(PART, true);
        element().querySelector<HTMLElement>('ion-button')?.click();
        await fixture.whenStable();

        expect(service.verify).not.toHaveBeenCalled();
    });

    it('lets an editor take back their own verification', async () => {
        create({...PART, verified: {revision: 2, by: [{name: 'Ajarn Dev'}], at: null}}, true);
        element().querySelector<HTMLButtonElement>('.link-button')?.click();
        await fixture.whenStable();

        expect(service.verify).toHaveBeenCalledOnceWith(7, 'summary', 2, false);
    });
});
