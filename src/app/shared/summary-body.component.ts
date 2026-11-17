import {Component, EventEmitter, inject, Input, OnChanges, Output} from '@angular/core';
import {AsyncPipe} from '@angular/common';
import {Observable} from 'rxjs';
import {StudyAidsProgressService} from '../study-aids-progress.service';
import {ChecklistViewComponent, TickChange} from './checklist-view.component';
import {Checklist, checklistFor} from '../study-aids/checklist';
import {LecturePlayback, StudyAids} from '../study-aids/study-aids.model';

const NO_TICKS: ReadonlySet<string> = new Set();

/** A lecture's AI summary with the reader's ticks, on the card and in the reading window. */
@Component({
    selector: 'app-summary-body',
    templateUrl: './summary-body.component.html',
    styleUrls: ['./summary-body.component.scss'],
    imports: [AsyncPipe, ChecklistViewComponent],
    host: {'[class.reader]': 'reader'},
})
export class SummaryBodyComponent implements OnChanges {
    private progress = inject(StudyAidsProgressService);

    @Input({required: true}) aids: StudyAids;
    @Input() playback: LecturePlayback | null = null;
    /** Laid out for the reading window rather than the card. */
    @Input() reader = false;
    @Output() seek = new EventEmitter<number>();

    protected checklist: Checklist | null = null;
    protected ticked$: Observable<ReadonlySet<string>>;
    protected readonly noTicks = NO_TICKS;

    private videoId: number | null = null;

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

    onTick(change: TickChange): void {
        this.progress.setTick(this.aids.video_id, change.key, change.ticked);
    }

    clearTicks(): void {
        this.progress.clearTicks(this.aids.video_id);
    }
}
