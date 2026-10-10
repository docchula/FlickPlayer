import {Component, ElementRef, inject, Input, OnInit, ViewChild, ViewEncapsulation} from '@angular/core';
import {AsyncPipe} from '@angular/common';
import {
    IonButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonIcon,
    IonLabel,
    IonSegment,
    IonSegmentButton,
    IonSpinner,
    IonTitle,
    IonToolbar,
    ModalController,
} from '@ionic/angular';
import {addIcons} from 'ionicons';
import {close} from 'ionicons/icons';
import {Observable} from 'rxjs';
import {Lecture} from '../man.service';
import {StudyAidsService} from '../study-aids.service';
import {SummaryBodyComponent} from './summary-body.component';
import {TranscriptBodyComponent} from './transcript-body.component';
import {QuizBodyComponent} from './quiz-body.component';
import {PartView} from './version-switch.component';
import {Checklist, checklistFor, formatClock} from '../study-aids/checklist';
import {isStudyTab, StudyTab, studyTabs, TAB_LABELS} from '../study-aids/tabs';
import {LecturePlayback, StudyAids, StudyAidsState} from '../study-aids/study-aids.model';

interface OutlineEntry {
    /** The section's position in the checklist, which is also its place in the page. */
    index: number;
    text: string;
    time: number | null;
}

export async function openReader(modalCtrl: ModalController, video: Lecture, playback: LecturePlayback | null, tab: StudyTab): Promise<void> {
    const modal = await modalCtrl.create({
        component: StudyAidsReaderComponent,
        cssClass: 'study-reader-modal',
        componentProps: {video, playback, tab},
    });
    await modal.present();
}

/** The summary, the transcription and the quiz in a large window, with room to read and practise. */
@Component({
    selector: 'app-study-aids-reader',
    templateUrl: './study-aids-reader.component.html',
    styleUrls: ['./study-aids-reader.component.scss'],
    // Sizes the ion-modal, which sits outside this component
    encapsulation: ViewEncapsulation.None,
    imports: [
        AsyncPipe,
        IonHeader,
        IonToolbar,
        IonTitle,
        IonButtons,
        IonButton,
        IonIcon,
        IonContent,
        IonSegment,
        IonSegmentButton,
        IonLabel,
        IonSpinner,
        SummaryBodyComponent,
        TranscriptBodyComponent,
        QuizBodyComponent,
    ],
})
export class StudyAidsReaderComponent implements OnInit {
    private service = inject(StudyAidsService);
    private modalCtrl = inject(ModalController);
    private host = inject<ElementRef<HTMLElement>>(ElementRef);

    @Input() video: Lecture;
    @Input() playback: LecturePlayback | null = null;
    @Input() tab: StudyTab = 'summary';

    @ViewChild(TranscriptBodyComponent) transcript?: TranscriptBodyComponent;

    protected state$: Observable<StudyAidsState>;
    protected activeSection = 0;
    /** The version of the summary on show; its sections are only listed for the edited one. */
    protected summaryView: PartView = 'current';
    protected readonly formatClock = formatClock;
    protected readonly tabLabels = TAB_LABELS;
    protected readonly tabsOf = studyTabs;

    private outlineFrom: Checklist | null = null;
    private outlineEntries: OutlineEntry[] = [];

    constructor() {
        addIcons({close});
    }

    ngOnInit(): void {
        this.state$ = this.service.watch(this.video.id as number);
    }

    aidsOf(state: StudyAidsState): StudyAids | null {
        return state.status === 'ready' ? state.aids : null;
    }

    /** The chosen tab, or the first with something in it. */
    activeTab(aids: StudyAids): StudyTab {
        const tabs = studyTabs(aids);

        return tabs.includes(this.tab) ? this.tab : tabs[0] ?? 'summary';
    }

    /** The summary's sections that say when they start, to move through the transcript by. */
    timedOutline(aids: StudyAids): OutlineEntry[] {
        const checklist = aids.summary ? checklistFor(aids.summary.markdown) : null;

        return (checklist?.sections ?? [])
            .map((section, index) => ({index, text: section.headingText ?? '', time: section.time}))
            .filter(entry => entry.text && entry.time !== null);
    }

    scrollTranscriptTo(entry: OutlineEntry): void {
        if (entry.time !== null) {
            this.transcript?.scrollToTime(entry.time);
            this.activeSection = entry.index;
        }
    }

    /** The sections worth listing beside a summary, or none when there is only one. */
    outline(aids: StudyAids): OutlineEntry[] {
        const checklist = aids.summary ? checklistFor(aids.summary.markdown) : null;
        if (checklist !== this.outlineFrom) {
            this.outlineFrom = checklist;
            const entries = (checklist?.sections ?? [])
                .map((section, index) => ({index, text: section.headingText ?? '', time: section.time}))
                .filter(entry => entry.text);
            this.outlineEntries = entries.length > 1 ? entries : [];
        }

        return this.outlineEntries;
    }

    onTab(event: Event): void {
        const value = (event as CustomEvent<{value: unknown}>).detail.value;
        if (isStudyTab(value)) {
            this.tab = value;
            this.activeSection = 0;
        }
    }

    /** Jumps the lecture from inside the window, which closes first so the video can be seen. */
    async watch(seconds: number): Promise<void> {
        await this.modalCtrl.dismiss();
        this.playback?.seek(seconds);
    }

    scrollToSection(index: number): void {
        this.sections()[index]?.scrollIntoView({behavior: 'smooth', block: 'start'});
        this.activeSection = index;
    }

    /** Marks the section whose heading was last scrolled past, as the transcript's outline does. */
    onScroll(): void {
        const top = (this.host.nativeElement.querySelector('ion-content')?.getBoundingClientRect().top ?? 0) + 80;
        let active = 0;
        this.sections().forEach((section, index) => {
            if (section.getBoundingClientRect().top <= top) {
                active = index;
            }
        });
        this.activeSection = active;
    }

    close(): void {
        void this.modalCtrl.dismiss();
    }

    private sections(): HTMLElement[] {
        return Array.from(this.host.nativeElement.querySelectorAll<HTMLElement>('app-checklist-view .checklist-section'));
    }
}
