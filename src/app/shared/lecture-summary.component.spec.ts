import {ComponentFixture, TestBed} from '@angular/core/testing';
import {ModalController} from '@ionic/angular/standalone';
import {of} from 'rxjs';
import {LectureSummaryComponent} from './lecture-summary.component';
import {StudyAidsService} from '../study-aids.service';
import {Lecture} from '../man.service';
import {StudyAids, StudyAidsState} from '../study-aids/study-aids.model';

const VIDEO = {id: 7, title: 'Organelles'} as Lecture;

const MARKDOWN = '# Organelles\n\n## Nucleus [00:01:10]\n\n1. **Barr body** : X − 1\n2. **Nucleolus** : rRNA\n';

function aids(changes: Partial<StudyAids> = {}): StudyAids {
    return {
        video_id: 7,
        can_edit: false,
        generation: 'ready',
        summary: {markdown: MARKDOWN, revision: 1, origin: 'ai', edited: false, contributors: [], updated_at: null},
        quiz: null,
        ...changes,
    };
}

describe('LectureSummaryComponent', () => {
    let fixture: ComponentFixture<LectureSummaryComponent>;
    let service: jasmine.SpyObj<Pick<StudyAidsService, 'watch' | 'refresh'>>;
    let seek: jasmine.Spy;

    const element = () => fixture.nativeElement as HTMLElement;
    const text = () => element().textContent?.replace(/\s+/g, ' ') ?? '';

    function create(state: StudyAidsState): void {
        service.watch.and.returnValue(of(state));
        fixture = TestBed.createComponent(LectureSummaryComponent);
        fixture.componentRef.setInput('video', VIDEO);
        fixture.componentRef.setInput('playback', {currentTime: () => 0, seek});
        fixture.detectChanges();
    }

    beforeEach(() => {
        localStorage.removeItem('flickSummaryTicks:7');
        localStorage.removeItem('flickStudyAidsCollapsed');
        service = jasmine.createSpyObj('StudyAidsService', ['watch', 'refresh']);
        seek = jasmine.createSpy('seek');
        TestBed.configureTestingModule({
            imports: [LectureSummaryComponent],
            providers: [
                {provide: StudyAidsService, useValue: service},
                {provide: ModalController, useValue: jasmine.createSpyObj('ModalController', ['create'])},
            ],
        });
    });

    afterEach(() => {
        localStorage.removeItem('flickSummaryTicks:7');
    });

    it('shows the AI draft as a numbered checklist', () => {
        create({status: 'ready', aids: aids()});

        expect(text()).toContain('AI draft');
        expect(text()).toContain('Organelles');
        expect(Array.from(element().querySelectorAll('.point-number')).map(number => number.textContent)).toEqual(['1.', '2.']);
        expect(element().querySelector('ion-button')).toBeNull();
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
        expect(JSON.parse(localStorage.getItem('flickSummaryTicks:7') ?? '[]').length).toBe(1);
    });

    it('names the editors who chose to be credited', () => {
        create({status: 'ready', aids: aids({summary: {...aids().summary!, origin: 'editor', edited: true, contributors: [{name: 'Kan'}, {name: 'Chain'}]}})});

        expect(text()).toContain('By Kan and Chain');
        expect(text()).not.toContain('AI draft');
    });

    it('shows nothing when there is no summary for a reader', () => {
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
