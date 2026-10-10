import {AfterViewInit, Component, ElementRef, inject, Input, OnInit, viewChild} from '@angular/core';
import {DatePipe} from '@angular/common';
import {
    IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonLabel, IonSegment, IonSegmentButton, IonTitle, IonToolbar, ModalController,
} from '@ionic/angular';
import {addIcons} from 'ionicons';
import {closeOutline} from 'ionicons/icons';
import {PlayStats, PlayStatValues} from '../man.service';
import {formatDuration} from '../../helpers';
import {
    averageSpeed, buildRecentGrid, buildYearGrid, DayCell, formatDay, HourCell, maxDayActual, maxHourActual, RecentRow, rangeStart, serverNow,
    STATS_RANGES, StatsRange, sumFrom, sumRecent, WeekColumn,
} from './play-stats';

/** Maximum width of the tooltip in px, see `.tip` */
const TIP_WIDTH = 200;

@Component({
    selector: 'app-modal-play-stats',
    templateUrl: 'modal-play-stats.component.html',
    styleUrls: ['modal-play-stats.component.scss'],
    imports: [
        DatePipe, IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonLabel, IonSegment, IonSegmentButton, IonTitle, IonToolbar,
    ],
})
export class ModalPlayStatsComponent implements OnInit, AfterViewInit {
    private modalCtrl = inject(ModalController);
    private scroller = viewChild<ElementRef<HTMLElement>>('scroller');
    private root = viewChild<ElementRef<HTMLElement>>('root');

    @Input() stats: PlayStats;

    readonly ranges = STATS_RANGES;
    range: StatsRange = '6m';
    /** First day of the selected range, and its totals */
    rangeFrom: string;
    rangeTotal: PlayStatValues;
    week: PlayStatValues;
    columns: WeekColumn[] = [];
    tip: { title: string, text: string, left: number, top: number } | null = null;
    /** Most actual seconds in one day (daily heatmap) and in one hour (week heatmap), the top of each legend */
    maxDay = 0;
    maxHour = 0;
    rows: RecentRow[] = [];
    readonly hourLabels = Array.from({length: 24}, (_, hour) => hour % 6 === 0 ? String(hour) : '');
    readonly levels = [0, 1, 2, 3, 4];

    protected readonly formatDuration = formatDuration;
    protected readonly formatDay = formatDay;

    constructor() {
        addIcons({closeOutline});
    }

    ngOnInit() {
        this.week = sumRecent(this.stats);
        this.maxHour = maxHourActual(this.stats);
        this.applyRange();
        this.rows = buildRecentGrid(this.stats, this.maxHour, serverNow(this.stats));
    }

    ngAfterViewInit() {
        this.scrollToLatest();
    }

    setRange(range: StatsRange) {
        if (range === this.range) {
            return;
        }
        this.range = range;
        this.hideTip();
        this.applyRange();
        // Wait for the new columns to be rendered
        setTimeout(() => this.scrollToLatest());
    }

    /** Totals and daily heatmap of the selected range */
    private applyRange() {
        const months = this.ranges.find(r => r.value === this.range).months;
        this.rangeFrom = rangeStart(this.stats, months);
        this.rangeTotal = sumFrom(this.stats, this.rangeFrom);
        this.maxDay = maxDayActual(this.stats, this.rangeFrom);
        this.columns = buildYearGrid(this.stats, this.maxDay, this.rangeFrom);
    }

    /** The most recent weeks are on the right */
    private scrollToLatest() {
        const el = this.scroller()?.nativeElement;
        if (el) {
            el.scrollLeft = el.scrollWidth;
        }
    }

    showDayTip(event: Event, day: DayCell) {
        this.showTip(event, formatDay(day.date), day);
    }

    showHourTip(event: Event, cell: HourCell) {
        this.showTip(event, `${formatDay(cell.date)}, ${cell.hour}:00–${cell.hour + 1}:00`, cell);
    }

    hideTip() {
        this.tip = null;
    }

    /** Shown above the cell, which also serves touch screens where a title attribute never appears */
    private showTip(event: Event, title: string, values: PlayStatValues) {
        // A tap on a cell must not reach the backdrop handler that hides the tip
        event.stopPropagation();
        const root = this.root()?.nativeElement;
        if (!root) {
            return;
        }
        const cell = (event.currentTarget as HTMLElement).getBoundingClientRect();
        const box = root.getBoundingClientRect();
        // The tip is at most TIP_WIDTH wide and centered on the cell, so keep its center this far from both edges
        const half = TIP_WIDTH / 2;
        this.tip = {
            title,
            text: values.actual_seconds
                ? `${formatDuration(values.video_seconds)} video · ${formatDuration(values.actual_seconds)} actual`
                : 'No activity',
            left: Math.min(Math.max(cell.left + cell.width / 2 - box.left, half), Math.max(half, box.width - half)),
            top: cell.top - box.top,
        };
    }

    /** Whole hours, e.g. 292 */
    hours(seconds: number): number {
        return Math.round(seconds / 3600);
    }

    /** e.g. "1.4x", or a dash when nothing was watched */
    speed(values: PlayStatValues): string {
        const speed = averageSpeed(values);
        return speed === null ? '–' : `${speed.toFixed(2).replace(/0$/, '')}x`;
    }

    close() {
        return this.modalCtrl.dismiss(null, 'close');
    }
}
