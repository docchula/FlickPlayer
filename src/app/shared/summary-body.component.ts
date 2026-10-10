import {Component, EventEmitter, inject, Input, OnChanges, Output} from '@angular/core';
import {AsyncPipe} from '@angular/common';
import {IonButton, IonIcon, IonSpinner, ModalController} from '@ionic/angular';
import {addIcons} from 'ionicons';
import {createOutline, peopleOutline} from 'ionicons/icons';
import {Observable, of} from 'rxjs';
import {catchError, map, startWith} from 'rxjs/operators';
import {StudyAidsService} from '../study-aids.service';
import {StudyAidsProgressService} from '../study-aids-progress.service';
import {ChecklistViewComponent, TickChange} from './checklist-view.component';
import {SummaryEditorComponent} from './summary-editor.component';
import {SummaryChangesComponent} from './summary-changes.component';
import {VerificationComponent} from './verification.component';
import {PartView, VersionSwitchComponent} from './version-switch.component';
import {openEditorsList} from './study-aids-editors.component';
import {buildChecklist, Checklist, checklistFor} from '../study-aids/checklist';
import {byline, formatDay} from '../study-aids/byline';
import {aiOriginal, HistoryState, summaryChanges, SummaryChanges} from '../study-aids/changes';
import {describeFailure} from '../study-aids/failures';
import {LecturePlayback, SaveFailure, StudyAids, SummaryRevision} from '../study-aids/study-aids.model';

const NO_TICKS: ReadonlySet<string> = new Set();

/**
 * A lecture's summary with its ticks and editing controls, on the card and in the reading window.
 * Readers can also see the AI's own draft, and what editors changed in it.
 */
@Component({
    selector: 'app-summary-body',
    templateUrl: './summary-body.component.html',
    styleUrls: ['./summary-body.component.scss'],
    imports: [
        AsyncPipe,
        IonButton,
        IonIcon,
        IonSpinner,
        ChecklistViewComponent,
        SummaryChangesComponent,
        VerificationComponent,
        VersionSwitchComponent,
    ],
    host: {'[class.reader]': 'reader'},
})
export class SummaryBodyComponent implements OnChanges {
    private service = inject(StudyAidsService);
    private progress = inject(StudyAidsProgressService);
    private modalCtrl = inject(ModalController);

    @Input({required: true}) aids: StudyAids;
    @Input() playback: LecturePlayback | null = null;
    /** Laid out for the reading window rather than the card. */
    @Input() reader = false;
    @Output() seek = new EventEmitter<number>();
    /** Which version is on show, for the reading window's list of sections. */
    @Output() viewChange = new EventEmitter<PartView>();

    protected checklist: Checklist | null = null;
    protected ticked$: Observable<ReadonlySet<string>>;
    protected view: PartView = 'current';
    protected history$: Observable<HistoryState<string>> | null = null;
    protected readonly byline = byline;
    protected readonly formatDay = formatDay;
    protected readonly noTicks = NO_TICKS;

    private videoId: number | null = null;
    private historyOf: number | null = null;
    private derivedFrom: SummaryRevision[] | null = null;
    private derived: {original: Checklist | null; originalAt: string | null; changes: SummaryChanges | null} | null = null;

    constructor() {
        addIcons({createOutline, peopleOutline});
    }

    ngOnChanges(): void {
        this.checklist = this.aids.summary ? checklistFor(this.aids.summary.markdown) : null;
        if (this.aids.video_id !== this.videoId) {
            this.videoId = this.aids.video_id;
            this.ticked$ = this.progress.ticks$(this.videoId);
            this.view = 'current';
            this.history$ = null;
            this.historyOf = null;
        } else if (this.view !== 'current') {
            this.loadHistory();
        }
        if (!this.hasHistory()) {
            this.view = 'current';
        }
    }

    /** Whether there is more than one version: an AI draft editors changed, or a summary edited since it was written. */
    hasHistory(): boolean {
        const summary = this.aids.summary;

        return !!summary && summary.edited && (summary.origin === 'ai' || summary.revision > 1);
    }

    setView(view: PartView): void {
        this.view = view;
        this.viewChange.emit(view);
        if (view !== 'current') {
            this.loadHistory();
        }
    }

    retryHistory(): void {
        this.historyOf = null;
        this.loadHistory();
    }

    /** The AI's draft and the changes since, worked out once for each set of versions. */
    derive(revisions: SummaryRevision[]): {original: Checklist | null; originalAt: string | null; changes: SummaryChanges | null} {
        if (revisions !== this.derivedFrom || !this.derived) {
            const original = aiOriginal(revisions);
            this.derivedFrom = revisions;
            this.derived = {
                original: original ? buildChecklist(original.content) : null,
                originalAt: original?.created_at ?? null,
                changes: summaryChanges(revisions),
            };
        }

        return this.derived;
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

    private loadHistory(): void {
        const summary = this.aids.summary;
        if (!summary || this.historyOf === summary.revision) {
            return;
        }
        this.historyOf = summary.revision;
        this.history$ = this.service.summaryRevisions(this.aids.video_id, summary.revision).pipe(
            map((revisions): HistoryState<string> => ({status: 'ready', revisions})),
            catchError((failure: SaveFailure) => of<HistoryState<string>>({status: 'error', message: describeFailure(failure)})),
            startWith<HistoryState<string>>({status: 'loading'}),
        );
    }
}
