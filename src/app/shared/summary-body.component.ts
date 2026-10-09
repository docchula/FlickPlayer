import {Component, EventEmitter, inject, Input, OnChanges, Output} from '@angular/core';
import {AsyncPipe} from '@angular/common';
import {IonButton, IonIcon, ModalController} from '@ionic/angular/standalone';
import {addIcons} from 'ionicons';
import {createOutline, peopleOutline} from 'ionicons/icons';
import {Observable} from 'rxjs';
import {StudyAidsProgressService} from '../study-aids-progress.service';
import {ChecklistViewComponent, TickChange} from './checklist-view.component';
import {SummaryEditorComponent} from './summary-editor.component';
import {openEditorsList} from './study-aids-editors.component';
import {Checklist, checklistFor} from '../study-aids/checklist';
import {byline} from '../study-aids/byline';
import {LecturePlayback, StudyAids} from '../study-aids/study-aids.model';

const NO_TICKS: ReadonlySet<string> = new Set();

/** A lecture's summary with its ticks and editing controls, on the card and in the reading window. */
@Component({
    selector: 'app-summary-body',
    templateUrl: './summary-body.component.html',
    styleUrls: ['./summary-body.component.scss'],
    imports: [AsyncPipe, IonButton, IonIcon, ChecklistViewComponent],
    host: {'[class.reader]': 'reader'},
})
export class SummaryBodyComponent implements OnChanges {
    private progress = inject(StudyAidsProgressService);
    private modalCtrl = inject(ModalController);

    @Input({required: true}) aids: StudyAids;
    @Input() playback: LecturePlayback | null = null;
    /** Laid out for the reading window rather than the card. */
    @Input() reader = false;
    @Output() seek = new EventEmitter<number>();

    protected checklist: Checklist | null = null;
    protected ticked$: Observable<ReadonlySet<string>>;
    protected readonly byline = byline;
    protected readonly noTicks = NO_TICKS;

    private videoId: number | null = null;

    constructor() {
        addIcons({createOutline, peopleOutline});
    }

    ngOnChanges(): void {
        this.checklist = this.aids.summary ? checklistFor(this.aids.summary.markdown) : null;
        if (this.aids.video_id !== this.videoId) {
            this.videoId = this.aids.video_id;
            this.ticked$ = this.progress.ticks$(this.videoId);
        }
    }

    reviewed(checklist: Checklist, ticked: ReadonlySet<string>): number {
        return checklist.pointKeys.filter(key => ticked.has(key)).length;
    }

    emptyNote(): string {
        switch (this.aids.generation) {
            case 'pending':
                return 'The AI is still drafting a summary. If you write one now, the AI draft will not replace it.';
            case 'failed':
                return 'The AI could not draft a summary of this lecture.';
            default:
                return 'There is no summary of this lecture yet.';
        }
    }

    onTick(change: TickChange): void {
        this.progress.setTick(this.aids.video_id, change.key, change.ticked);
    }

    clearTicks(): void {
        this.progress.clearTicks(this.aids.video_id);
    }

    manageEditors(): void {
        void openEditorsList(this.modalCtrl, this.aids.video_id);
    }

    async edit(): Promise<void> {
        const modal = await this.modalCtrl.create({
            component: SummaryEditorComponent,
            cssClass: 'study-editor-modal',
            backdropDismiss: false,
            componentProps: {
                videoId: this.aids.video_id,
                summary: this.aids.summary,
                generation: this.aids.generation,
                playback: this.playback,
            },
        });
        await modal.present();
    }
}
