import {ComponentFixture, TestBed} from '@angular/core/testing';
import {ModalController} from '@ionic/angular';
import {BehaviorSubject, of} from 'rxjs';
import {StudyAidsReaderComponent} from './study-aids-reader.component';
import {StudyAidsService} from '../study-aids.service';
import {StudyAidsProgressService} from '../study-aids-progress.service';
import {Lecture} from '../man.service';
import {StudyAids, StudyAidsState, TranscriptState} from '../study-aids/study-aids.model';
import {StudyTab} from '../study-aids/tabs';

const VIDEO = {id: 7, title: 'Organelles', duration: 3000} as Lecture;
const MARKDOWN = '# Organelles\n\n## Nucleus [00:01:10]\n\n1. **Barr body** : X − 1\n\n## Golgi [00:14:05]\n\n1. **Golgi** : sorts protein\n';

const AIDS: StudyAids = {
    video_id: 7,
    can_edit: false,
    can_manage: false,
    generation: 'ready',
    has_transcript: true,
    summary: {markdown: MARKDOWN, revision: 1, origin: 'ai', edited: false, contributors: [], updated_at: null, verified: null},
    quiz: {
        questions: [{id: 'a', prompt: 'Which cell?', choices: ['Plasma cell', 'Leydig cell'], answer: 1, explanation: null, time: 465, stats: null, mine: null}],
        revision: 1, origin: 'ai', edited: false, contributors: [], updated_at: null, verified: null,
    },
};

const TRANSCRIPT: TranscriptState = {status: 'ready', paragraphs: [
    {time: 5, text: 'สวัสดีครับ'},
    {time: 70, text: 'Nucleus เก็บ genetic material'},
    {time: 845, text: 'Golgi รับ protein จาก RER'},
]};

describe('StudyAidsReaderComponent', () => {
    let fixture: ComponentFixture<StudyAidsReaderComponent>;
    let modalCtrl: jasmine.SpyObj<Pick<ModalController, 'create' | 'dismiss'>>;
    let seek: jasmine.Spy;

    const element = () => fixture.nativeElement as HTMLElement;
    const text = () => element().textContent?.replace(/\s+/g, ' ') ?? '';

    function create(tab: StudyTab, state: StudyAidsState = {status: 'ready', aids: AIDS}): void {
        TestBed.inject(StudyAidsService).watch = () => new BehaviorSubject(state);
        fixture = TestBed.createComponent(StudyAidsReaderComponent);
        fixture.componentRef.setInput('video', VIDEO);
        fixture.componentRef.setInput('playback', {currentTime: () => 0, seek});
        fixture.componentRef.setInput('tab', tab);
        fixture.detectChanges();
    }

    beforeEach(() => {
        localStorage.removeItem('flickSummaryTicks:7');
        localStorage.removeItem('flickQuizAnswers:7');
        modalCtrl = jasmine.createSpyObj('ModalController', ['create', 'dismiss']);
        modalCtrl.dismiss.and.resolveTo(true);
        seek = jasmine.createSpy('seek');
        TestBed.configureTestingModule({
            imports: [StudyAidsReaderComponent],
            providers: [
                {provide: StudyAidsService, useValue: {
                    watch: () => new BehaviorSubject<StudyAidsState>({status: 'loading'}),
                    transcript: () => of(TRANSCRIPT),
                    profile: () => of(null),
                }},
                {provide: ModalController, useValue: modalCtrl},
            ],
        });
    });

    afterEach(() => {
        localStorage.removeItem('flickSummaryTicks:7');
        localStorage.removeItem('flickQuizAnswers:7');
    });

    it('opens on the tab it was asked for', () => {
        create('quiz');

        expect(element().querySelector('app-quiz-body')).not.toBeNull();
        expect(element().querySelector('app-summary-body')).toBeNull();
        expect(text()).toContain('Organelles');
        expect(Array.from(element().querySelectorAll('ion-segment-button')).map(button => button.textContent?.trim()))
            .toEqual(['Summary', 'Transcription', 'Quiz']);
    });

    it('moves through the transcription by the summary\'s sections', () => {
        create('transcript');
        const transcript = element().querySelector('app-transcript-body');
        const scrolled = spyOn(HTMLElement.prototype, 'scrollIntoView');
        const entries = Array.from(element().querySelectorAll<HTMLButtonElement>('.outline-entry'));

        expect(transcript?.textContent).toContain('Golgi รับ protein จาก RER');
        expect(entries.map(entry => entry.querySelector('.outline-time')?.textContent?.trim())).toEqual(['1:10', '14:05']);
        entries[1].click();
        expect((scrolled.calls.mostRecent().object as HTMLElement).textContent).toContain('Golgi รับ protein');
    });

    it('lists the summary\'s sections beside it', () => {
        create('summary');
        const entries = Array.from(element().querySelectorAll('.outline-entry'))
            .map(entry => [entry.querySelector('.outline-text')?.textContent?.trim(), entry.querySelector('.outline-time')?.textContent?.trim()]);

        expect(entries).toEqual([['Nucleus', '1:10'], ['Golgi', '14:05']]);
    });

    it('closes before jumping the lecture, so the video can be seen', async () => {
        create('summary');
        element().querySelector<HTMLButtonElement>('button.time-chip')?.click();
        await fixture.whenStable();

        expect(modalCtrl.dismiss).toHaveBeenCalled();
        expect(seek).toHaveBeenCalledWith(70);
    });

    it('shares ticks with the card', () => {
        create('summary');
        TestBed.inject(StudyAidsProgressService).setTick(7, 'unknown-key', true);
        const box = element().querySelector<HTMLInputElement>('.point-tick');
        box!.checked = true;
        box!.dispatchEvent(new Event('change'));
        fixture.detectChanges();

        expect(JSON.parse(localStorage.getItem('flickSummaryTicks:7') ?? '[]').length).toBe(2);
        expect(text()).toContain('1 of 2 points ticked.');
    });

    it('says so when a lecture has nothing to read', () => {
        create('summary', {status: 'unavailable'});

        expect(text()).toContain('There is no summary, transcription or quiz for this lecture.');
    });
});
