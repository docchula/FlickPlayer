import {ComponentFixture, TestBed} from '@angular/core/testing';
import {of} from 'rxjs';
import {SummaryBodyComponent} from './summary-body.component';
import {StudyAidsService} from '../study-aids.service';
import {StudyAids} from '../study-aids/study-aids.model';

const SUMMARY = '# Organelles\n\n## Lysosome [00:21:40]\n\n1. **Lysosome** : pH 5\n2. **Gaucher** : glucocerebrosidase\n';

function aids(changes: Partial<StudyAids> = {}): StudyAids {
    return {
        video_id: 7,
        generation: 'ready',
        has_transcript: false,
        my_ticks: null,
        summary: {markdown: SUMMARY},
        quiz: null,
        ...changes,
    };
}

describe('SummaryBodyComponent', () => {
    let fixture: ComponentFixture<SummaryBodyComponent>;
    let service: jasmine.SpyObj<Pick<StudyAidsService, 'watch' | 'saveTicks'>>;

    const element = () => fixture.nativeElement as HTMLElement;
    const text = () => element().textContent?.replace(/\s+/g, ' ') ?? '';

    function show(value: StudyAids): void {
        fixture.componentRef.setInput('aids', value);
        fixture.detectChanges();
    }

    beforeEach(() => {
        localStorage.removeItem('flickSummaryTicks:7');
        service = jasmine.createSpyObj('StudyAidsService', ['watch', 'saveTicks']);
        service.watch.and.returnValue(of({status: 'loading'}));
        service.saveTicks.and.callFake((videoId, ticks) => of(ticks));
        TestBed.configureTestingModule({
            imports: [SummaryBodyComponent],
            providers: [{provide: StudyAidsService, useValue: service}],
        });
        fixture = TestBed.createComponent(SummaryBodyComponent);
    });

    afterEach(() => localStorage.removeItem('flickSummaryTicks:7'));

    it('says the AI wrote the summary, and shows it as a checklist to tick', () => {
        show(aids());

        expect(text()).toContain('Written by AI from the lecture recording. Check it against the lecture.');
        expect(text()).toContain('Tick each point once you know it.');
        expect(element().querySelectorAll('.point-tick').length).toBe(2);
    });

    it('counts the ticked points and clears them', () => {
        show(aids());
        const box = element().querySelector<HTMLInputElement>('.point-tick')!;
        box.checked = true;
        box.dispatchEvent(new Event('change'));
        fixture.detectChanges();

        expect(text()).toContain('1 of 2 points ticked.');

        element().querySelector<HTMLButtonElement>('.link-button')!.click();
        fixture.detectChanges();
        expect(text()).toContain('Tick each point once you know it.');
    });

    it('draws a diagram line for line in a fixed-width font', () => {
        show(aids({summary: {markdown: '# Veins\n\n1. **Face** : veins\n\n```\n  Facial v.\n      │\n      ▼\n[ Internal jugular v. ]\n```\n'}}));
        const pre = element().querySelector('pre')!;

        expect(pre.textContent).toBe('  Facial v.\n      │\n      ▼\n[ Internal jugular v. ]\n');
        expect(getComputedStyle(pre).whiteSpace).toBe('pre');
        expect(getComputedStyle(pre).overflowX).toBe('auto');
        expect(getComputedStyle(pre).fontFamily).toContain('Menlo');
        expect(getComputedStyle(pre.querySelector('code')!).paddingLeft).toBe('0px');
    });

    it('says when the AI is still writing the summary, or there is none', () => {
        show(aids({summary: null, generation: 'pending'}));
        expect(text()).toContain('The AI is still writing a summary of this lecture.');

        show(aids({summary: null, generation: 'failed'}));
        expect(text()).toContain('There is no summary of this lecture.');
    });
});
