import {Component, ElementRef, inject, Input, NgZone} from '@angular/core';
import {AsyncPipe} from '@angular/common';
import {IonButton, IonCard, IonIcon, IonSpinner, ModalController} from '@ionic/angular/standalone';
import {addIcons} from 'ionicons';
import {chevronDown, chevronUp, createOutline, peopleOutline} from 'ionicons/icons';
import {BehaviorSubject, combineLatest, Observable, of} from 'rxjs';
import {map, switchMap} from 'rxjs/operators';
import {Lecture} from '../man.service';
import {StudyAidsService} from '../study-aids.service';
import {ChecklistViewComponent, TickChange} from './checklist-view.component';
import {SummaryEditorComponent} from './summary-editor.component';
import {openEditorsList} from './study-aids-editors.component';
import {buildChecklist, Checklist} from '../study-aids/checklist';
import {byline, isAiDraft} from '../study-aids/byline';
import {displayed} from '../study-aids/displayed';
import {readCollapsed, readTicks, writeCollapsed, writeTicks} from '../study-aids/local-store';
import {LecturePlayback, StudyAids, StudyAidsState, SummaryPart} from '../study-aids/study-aids.model';

interface SummaryView {
    videoId: number;
    status: StudyAidsState['status'];
    aids: StudyAids | null;
    summary: SummaryPart | null;
    checklist: Checklist | null;
}

/**
 * The lecture's summary as a checklist, under the video. Readers tick the points they know;
 * editors can rewrite it. Shows nothing for a lecture that has no summary.
 */
@Component({
    selector: 'app-lecture-summary',
    templateUrl: './lecture-summary.component.html',
    styleUrls: ['./lecture-summary.component.scss'],
    imports: [AsyncPipe, IonCard, IonButton, IonIcon, IonSpinner, ChecklistViewComponent],
})
export class LectureSummaryComponent {
    private service = inject(StudyAidsService);
    private modalCtrl = inject(ModalController);

    private readonly video$ = new BehaviorSubject<Lecture | null>(null);

    @Input() set video(video: Lecture | null) {
        this.video$.next(video);
    }

    @Input() playback: LecturePlayback | null = null;

    protected collapsed = readCollapsed('summary');
    protected ticked: ReadonlySet<string> = new Set();
    protected readonly byline = byline;
    protected readonly isAiDraft = isAiDraft;

    private tickedVideo: number | null = null;
    private builtFrom: string | null = null;
    private built: Checklist | null = null;

    protected readonly view$: Observable<SummaryView | null> = combineLatest([
        this.video$,
        displayed(inject<ElementRef<HTMLElement>>(ElementRef).nativeElement, inject(NgZone)),
    ]).pipe(
        switchMap(([video, shown]) => video?.id && shown
            ? this.service.watch(video.id).pipe(map(state => this.toView(video.id as number, state)))
            : of(null)),
    );

    constructor() {
        addIcons({chevronDown, chevronUp, createOutline, peopleOutline});
    }

    shows(view: SummaryView): boolean {
        if (view.status !== 'ready') {
            return view.status !== 'unavailable';
        }

        return !!view.summary || !!view.aids?.can_edit || view.aids?.generation === 'pending';
    }

    reviewed(checklist: Checklist): number {
        return checklist.pointKeys.filter(key => this.ticked.has(key)).length;
    }

    emptyNote(aids: StudyAids): string {
        switch (aids.generation) {
            case 'pending':
                return 'The AI is still drafting a summary. If you write one now, the AI draft will not replace it.';
            case 'failed':
                return 'The AI could not draft a summary of this lecture.';
            default:
                return 'There is no summary of this lecture yet.';
        }
    }

    toggle(): void {
        this.collapsed = !this.collapsed;
        writeCollapsed('summary', this.collapsed);
    }

    onTick(view: SummaryView, change: TickChange): void {
        const ticked = new Set(this.ticked);
        if (change.ticked) {
            ticked.add(change.key);
        } else {
            ticked.delete(change.key);
        }
        this.ticked = ticked;
        writeTicks(view.videoId, ticked);
    }

    clearTicks(view: SummaryView): void {
        this.ticked = new Set();
        writeTicks(view.videoId, this.ticked);
    }

    seek(seconds: number): void {
        this.playback?.seek(seconds);
    }

    retry(view: SummaryView): void {
        this.service.refresh(view.videoId);
    }

    manageEditors(view: SummaryView): void {
        void openEditorsList(this.modalCtrl, view.videoId);
    }

    async edit(view: SummaryView): Promise<void> {
        if (!view.aids) {
            return;
        }
        const modal = await this.modalCtrl.create({
            component: SummaryEditorComponent,
            cssClass: 'study-editor-modal',
            backdropDismiss: false,
            componentProps: {
                videoId: view.videoId,
                summary: view.summary,
                generation: view.aids.generation,
                playback: this.playback,
            },
        });
        await modal.present();
    }

    private toView(videoId: number, state: StudyAidsState): SummaryView {
        if (videoId !== this.tickedVideo) {
            this.tickedVideo = videoId;
            this.ticked = readTicks(videoId);
        }
        const aids = state.status === 'ready' ? state.aids : null;
        const summary = aids?.summary ?? null;

        return {videoId, status: state.status, aids, summary, checklist: summary ? this.checklistFor(summary.markdown) : null};
    }

    /** Parsing a long summary is not free, so it is redone only when the text changes. */
    private checklistFor(markdown: string): Checklist {
        if (markdown !== this.builtFrom || !this.built) {
            this.builtFrom = markdown;
            this.built = buildChecklist(markdown);
        }

        return this.built;
    }
}
