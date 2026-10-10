import {ComponentFixture, TestBed} from '@angular/core/testing';
import {ModalController} from '@ionic/angular';
import {of, throwError} from 'rxjs';
import {SummaryBodyComponent} from './summary-body.component';
import {StudyAidsService} from '../study-aids.service';
import {StudyAids, SummaryRevision} from '../study-aids/study-aids.model';

const AI = '# Organelles\n\n## Lysosome [00:21:40]\n\n1. **Lysosome** : pH 5\n2. **Gaucher** : glucocerebrosidase\n';
const EDITED = '# Organelles\n\n## Lysosome [00:21:40]\n\n1. **Lysosome** : pH 4.5\n2. **Gaucher** : glucocerebrosidase\n3. **Fabry** : galactosidase\n';

const REVISIONS: SummaryRevision[] = [
    {revision: 1, author: null, created_at: '2026-10-09T10:00:00+07:00', content: AI},
    {revision: 2, author: {key: 'e1', name: 'Kan'}, created_at: '2026-10-09T11:00:00+07:00', content: AI.replace('pH 5', 'pH 4.5')},
    {revision: 3, author: {key: 'e2', name: null}, created_at: '2026-10-09T12:00:00+07:00', content: EDITED},
];

function aids(): StudyAids {
    return {
        video_id: 7,
        can_edit: false,
        can_manage: false,
        generation: 'ready',
        has_transcript: false,
        my_ticks: null,
        summary: {markdown: EDITED, revision: 3, origin: 'ai', edited: true, contributors: [{name: 'Kan'}], updated_at: null, verified: null},
        quiz: null,
    };
}

describe('SummaryBodyComponent', () => {
    let fixture: ComponentFixture<SummaryBodyComponent>;
    let service: jasmine.SpyObj<Pick<StudyAidsService, 'summaryRevisions' | 'profile' | 'watch' | 'saveTicks'>>;

    const element = () => fixture.nativeElement as HTMLElement;
    const text = () => element().textContent?.replace(/\s+/g, ' ') ?? '';
    const show = (label: string) => {
        Array.from(element().querySelectorAll<HTMLButtonElement>('.version-switch button'))
            .find(button => button.textContent?.trim() === label)?.click();
        fixture.detectChanges();
    };

    beforeEach(() => {
        localStorage.removeItem('flickSummaryTicks:7');
        service = jasmine.createSpyObj('StudyAidsService', ['summaryRevisions', 'profile', 'watch', 'saveTicks']);
        service.watch.and.returnValue(of({status: 'loading'}));
        service.summaryRevisions.and.returnValue(of(REVISIONS));
        service.profile.and.returnValue(of(null));
        TestBed.configureTestingModule({
            imports: [SummaryBodyComponent],
            providers: [
                {provide: StudyAidsService, useValue: service},
                {provide: ModalController, useValue: jasmine.createSpyObj('ModalController', ['create'])},
            ],
        });
        fixture = TestBed.createComponent(SummaryBodyComponent);
        fixture.componentRef.setInput('aids', aids());
        fixture.detectChanges();
    });

    it('shows the edited version first and only fetches others when asked', () => {
        expect(text()).toContain('pH 4.5');
        expect(element().querySelectorAll('.point-tick').length).toBe(3);
        expect(service.summaryRevisions).not.toHaveBeenCalled();
    });

    it('shows the AI\'s own draft, without ticks', () => {
        show('AI original');

        expect(service.summaryRevisions).toHaveBeenCalledWith(7, 3);
        expect(text()).toContain('The summary as the AI wrote it on 9 Oct 2026');
        expect(text()).toContain('pH 5');
        expect(text()).not.toContain('Fabry');
        expect(element().querySelectorAll('.point-tick').length).toBe(0);
    });

    it('marks every change with the editor who made it', () => {
        show('Show changes');
        const added = Array.from(element().querySelectorAll('.changes-body ins')).map(mark => [mark.textContent, mark.getAttribute('title')]);
        const removed = Array.from(element().querySelectorAll('.changes-body del')).map(mark => [mark.textContent, mark.getAttribute('title')]);

        expect(added).toEqual([['4.5', 'Added by Kan on 9 Oct 2026']]);
        expect(removed).toEqual([['5', 'Removed by Kan on 9 Oct 2026']]);
        expect(element().querySelector('.whole-added')?.textContent).toContain('Fabry');
        expect(text()).toContain('Added by an unnamed editor on 9 Oct 2026');
        expect(Array.from(element().querySelectorAll('.change-legend li')).map(entry => entry.textContent?.replace(/\s+/g, ' ').trim()))
            .toEqual(['Kan +1 −1', 'Unnamed editor +2 −0']);
    });

    it('goes back to the edited version', () => {
        show('Show changes');
        show('Edited by editors');

        expect(element().querySelector('app-summary-changes')).toBeNull();
        expect(element().querySelectorAll('.point-tick').length).toBe(3);
    });

    it('offers to try again when the versions could not be loaded', () => {
        service.summaryRevisions.and.returnValue(throwError(() => ({kind: 'network'})));
        show('Show changes');

        expect(text()).toContain('The earlier versions could not be loaded.');
        service.summaryRevisions.and.returnValue(of(REVISIONS));
        Array.from(element().querySelectorAll<HTMLElement>('ion-button')).find(button => button.textContent?.trim() === 'Try again')?.click();
        fixture.detectChanges();
        expect(element().querySelector('app-summary-changes')).not.toBeNull();
    });
});
