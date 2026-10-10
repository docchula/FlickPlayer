import {ComponentFixture, TestBed} from '@angular/core/testing';
import {AlertController} from '@ionic/angular';
import {BehaviorSubject, of, throwError} from 'rxjs';
import {CreditFieldComponent} from './credit-field.component';
import {StudyAidsService} from '../study-aids.service';
import {EditorProfile} from '../study-aids/study-aids.model';

describe('CreditFieldComponent', () => {
    let fixture: ComponentFixture<CreditFieldComponent>;
    let profile$: BehaviorSubject<EditorProfile | null>;
    let service: jasmine.SpyObj<Pick<StudyAidsService, 'profile' | 'saveProfile'>>;

    const element = () => fixture.nativeElement as HTMLElement;
    const text = () => element().textContent?.replace(/\s+/g, ' ') ?? '';

    function create(profile: EditorProfile | null): void {
        profile$ = new BehaviorSubject(profile);
        service.profile.and.returnValue(profile$);
        fixture = TestBed.createComponent(CreditFieldComponent);
        fixture.detectChanges();
    }

    async function rename(name: string): Promise<void> {
        element().querySelector<HTMLButtonElement>('.link-button')?.click();
        fixture.detectChanges();
        element().querySelector('ion-input')?.dispatchEvent(new CustomEvent('ionInput', {detail: {value: name}}));
        element().querySelector('form')?.dispatchEvent(new Event('submit'));
        await fixture.whenStable();
        fixture.detectChanges();
    }

    beforeEach(() => {
        service = jasmine.createSpyObj('StudyAidsService', ['profile', 'saveProfile']);
        TestBed.configureTestingModule({
            imports: [CreditFieldComponent],
            providers: [
                {provide: StudyAidsService, useValue: service},
                {provide: AlertController, useValue: {create: () => Promise.resolve({
                    present: () => Promise.resolve(),
                    onDidDismiss: () => Promise.resolve({role: 'confirm'}),
                })}},
            ],
        });
    });

    it('shows the display name students see', () => {
        create({name: 'Local Developer', changed_at: null, next_change_at: null});

        expect(text()).toContain('Your display name: Local Developer');
        expect(element().querySelector('.link-button')?.textContent?.trim()).toBe('Change');
    });

    it('says when the name can next be changed', () => {
        create({name: 'Ajarn Dev', changed_at: '2026-10-09T16:52:22+00:00', next_change_at: new Date(Date.now() + 86_400_000).toISOString()});

        expect(text()).toContain('You can change it again on');
        expect(element().querySelector('.link-button')).toBeNull();
    });

    it('changes the name once confirmed', async () => {
        create({name: 'Local Developer', changed_at: null, next_change_at: null});
        service.saveProfile.and.callFake(name => {
            const saved = {name, changed_at: '2026-10-09T16:52:22+00:00', next_change_at: '2026-11-08T16:52:22+00:00'};
            profile$.next(saved);

            return of(saved);
        });
        await rename('  Ajarn   Dev ');

        expect(service.saveProfile).toHaveBeenCalledOnceWith('Ajarn Dev');
        expect(text()).toContain('Your display name: Ajarn Dev');
    });

    it('shows FlickMan\'s reason when a name is refused', async () => {
        create({name: 'Local Developer', changed_at: null, next_change_at: null});
        service.saveProfile.and.returnValue(throwError(() => ({
            kind: 'invalid', message: 'Invalid', errors: {name: ['Another editor already uses this name.']},
        })));
        await rename('Kan');

        expect(element().querySelector('.credit-problem')?.textContent).toContain('Another editor already uses this name.');
    });

    it('has no name to show a reader who is not an editor', () => {
        create(null);

        expect(element().querySelector('.display-name')).toBeNull();
    });
});
