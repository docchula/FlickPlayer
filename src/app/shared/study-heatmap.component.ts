import {AfterViewInit, Component, ElementRef, inject, OnDestroy, OnInit, ViewChild} from '@angular/core';
import {
    IonButton,
    IonCard,
    IonCardContent,
    IonCardHeader,
    IonCardTitle,
    IonIcon,
    IonSegment,
    IonSegmentButton,
    IonLabel,
    PopoverController,
} from '@ionic/angular/standalone';
import {addIcons} from 'ionicons';
import {
    calendarOutline,
    chevronDown,
    chevronUp,
    flameOutline,
    informationCircleOutline,
    timeOutline,
    trophyOutline,
} from 'ionicons/icons';
import {Subscription} from 'rxjs';
import {StudyHeatmapGuideComponent} from './study-heatmap-guide.component';
import {
    addDays,
    computeStudyStats,
    fromDateKey,
    DEFAULT_HEATMAP_RANGE,
    HEATMAP_RANGES,
    StudyDayMap,
    StudyStats,
    StudyStatsService,
    toDateKey,
} from '../study-stats.service';

interface HeatmapCell {
    key: string;
    level: number;
    seconds: number;
    pomodoros: number;
    videos: number;
    inRange: boolean;
    label: string;
}

interface HeatmapWeek {
    key: string;
    monthLabel: string | null;
    days: HeatmapCell[];
}

interface StatTile {
    icon: string;
    label: string;
    value: string;
    detail: string;
}

const WEEKDAY_LABELS = ['', 'Mon', '', 'Wed', '', 'Fri', ''];
/** A month name is wider than its column, so this much overhang is not real overflow. */
const MONTH_LABEL_OVERHANG = 32;
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * GitHub-style calendar of daily study activity, with streak and total statistics.
 */
@Component({
    selector: 'app-study-heatmap',
    templateUrl: './study-heatmap.component.html',
    styleUrls: ['./study-heatmap.component.scss'],
    imports: [
        IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonIcon,
        IonSegment, IonSegmentButton, IonLabel, IonButton,
    ],
})
export class StudyHeatmapComponent implements OnInit, AfterViewInit, OnDestroy {
    private studyStats = inject(StudyStatsService);
    private popoverCtrl = inject(PopoverController);

    @ViewChild('scroller') scroller: ElementRef<HTMLDivElement>;

    readonly ranges = HEATMAP_RANGES;
    readonly weekdayLabels = WEEKDAY_LABELS;
    readonly legendLevels = [0, 1, 2, 3, 4];

    isCollapsed = false;
    rangeKey = DEFAULT_HEATMAP_RANGE;
    weeks: HeatmapWeek[] = [];
    tiles: StatTile[] = [];
    stats: StudyStats;
    tooltip: { text: string, x: number, y: number } | null = null;
    emptyHint = '';

    private days: StudyDayMap = {};
    private subscription: Subscription;

    constructor() {
        addIcons({
            chevronDown, chevronUp, flameOutline, timeOutline,
            trophyOutline, calendarOutline, informationCircleOutline,
        });
        this.stats = computeStudyStats({}, toDateKey(new Date()), toDateKey(new Date()));
    }

    ngOnInit() {
        this.subscription = this.studyStats.activity$.subscribe(days => {
            this.days = days;
            this.build();
        });
    }

    ngAfterViewInit() {
        setTimeout(() => this.scrollToToday());
    }

    ngOnDestroy() {
        this.subscription?.unsubscribe();
    }

    async openGuide(event: Event) {
        event.stopPropagation();
        const popover = await this.popoverCtrl.create({
            component: StudyHeatmapGuideComponent,
            event,
        });
        await popover.present();
    }

    toggleCollapse() {
        this.isCollapsed = !this.isCollapsed;
        if (!this.isCollapsed) {
            setTimeout(() => this.scrollToToday());
        }
    }

    selectRange(event: Event) {
        const value = (event as CustomEvent).detail?.value;
        if (typeof value === 'string' && value !== this.rangeKey) {
            this.rangeKey = value;
            this.build();
            setTimeout(() => this.scrollToToday());
        }
    }

    showTooltip(cell: HeatmapCell, event: MouseEvent) {
        if (!cell.inRange) {
            this.tooltip = null;
            return;
        }
        const cellElement = event.currentTarget as HTMLElement;
        const target = cellElement.getBoundingClientRect();
        const wrapper = cellElement.closest('.calendar-wrapper')?.getBoundingClientRect();
        if (!wrapper) {
            return;
        }
        this.tooltip = {
            text: cell.label,
            x: target.left - wrapper.left + target.width / 2,
            y: target.top - wrapper.top - 4,
        };
    }

    hideTooltip() {
        this.tooltip = null;
    }

    private build() {
        const today = new Date();
        const todayKey = toDateKey(today);
        const start = this.rangeStart(today);
        const startKey = toDateKey(start);

        this.stats = computeStudyStats(this.days, startKey, todayKey);
        this.tiles = this.buildTiles();
        this.emptyHint = this.stats.daysStudied
            ? ''
            : 'Watch a lecture or run the Pomodoro timer to start filling this in.';

        const thresholds = this.buildThresholds(startKey, todayKey);
        const gridStart = addDays(start, -start.getDay());
        const gridEnd = addDays(today, 6 - today.getDay());
        const weeks: HeatmapWeek[] = [];

        for (let cursor = gridStart; cursor <= gridEnd; cursor = addDays(cursor, 7)) {
            const days: HeatmapCell[] = [];
            for (let offset = 0; offset < 7; offset++) {
                const date = addDays(cursor, offset);
                const key = toDateKey(date);
                const day = this.days[key];
                const seconds = day?.seconds ?? 0;
                days.push({
                    key,
                    seconds,
                    pomodoros: day?.pomodoros ?? 0,
                    videos: (day?.videoIds?.length ?? 0) + (day?.remoteVideos ?? 0),
                    level: this.levelOf(seconds, thresholds),
                    inRange: key >= startKey && key <= todayKey,
                    label: this.describe(date, seconds,
                        (day?.videoIds?.length ?? 0) + (day?.remoteVideos ?? 0), day?.pomodoros ?? 0),
                });
            }
            // Label the column a month starts in, plus the leftmost one when its month started off-grid.
            const monthStart = days.find(cell => fromDateKey(cell.key).getDate() === 1);
            const leadingMonth = !weeks.length && cursor.getDate() <= 7 ? cursor.getMonth() : null;
            const labelMonth = monthStart ? fromDateKey(monthStart.key).getMonth() : leadingMonth;
            weeks.push({
                key: days[0].key,
                monthLabel: labelMonth === null ? null : MONTH_NAMES[labelMonth],
                days,
            });
        }

        this.weeks = weeks;
    }

    private rangeStart(today: Date): Date {
        const range = HEATMAP_RANGES.find(r => r.key === this.rangeKey) ?? HEATMAP_RANGES[2];
        if (range.months === null) {
            const first = this.studyStats.getFirstActiveDate();
            const floor = addDays(today, -365 * 5);
            if (!first) {
                return addDays(today, -364);
            }
            return first > floor ? first : floor;
        }
        const start = new Date(today.getFullYear(), today.getMonth() - range.months, today.getDate());
        return addDays(start, 1);
    }

    /** Quartiles of the days actually studied, so the scale adapts to how much the user watches. */
    private buildThresholds(startKey: string, endKey: string): number[] {
        const values = Object.keys(this.days)
            .filter(key => key >= startKey && key <= endKey && this.days[key].seconds > 0)
            .map(key => this.days[key].seconds)
            .sort((a, b) => a - b);
        if (!values.length) {
            return [0, 0, 0];
        }
        const at = (percentile: number) => values[Math.min(values.length - 1, Math.floor(values.length * percentile))];
        return [at(0.25), at(0.5), at(0.75)];
    }

    private levelOf(seconds: number, thresholds: number[]): number {
        if (seconds <= 0) {
            return 0;
        }
        if (seconds <= thresholds[0]) {
            return 1;
        }
        if (seconds <= thresholds[1]) {
            return 2;
        }
        return seconds <= thresholds[2] ? 3 : 4;
    }

    private buildTiles(): StatTile[] {
        const percent = this.stats.daysInRange
            ? Math.round((this.stats.daysStudied / this.stats.daysInRange) * 100)
            : 0;
        return [
            {
                icon: 'flame-outline',
                label: 'Current streak',
                value: this.formatDays(this.stats.currentStreak),
                detail: this.stats.currentStreak ? 'keep it going' : 'no streak yet',
            },
            {
                icon: 'trophy-outline',
                label: 'Longest streak',
                value: this.formatDays(this.stats.longestStreak),
                detail: this.stats.busiestDate
                    ? 'best day ' + this.formatDuration(this.stats.busiestSeconds)
                    : '',
            },
            {
                icon: 'calendar-outline',
                label: 'Days studied',
                value: this.stats.daysStudied + ' of ' + this.stats.daysInRange,
                detail: percent + '% of the period',
            },
            {
                icon: 'time-outline',
                label: 'Total studied',
                value: this.formatDuration(this.stats.totalSeconds),
                detail: this.stats.daysStudied
                    ? this.formatDuration(this.stats.averageSeconds) + ' per active day'
                    : '',
            },
        ];
    }

    private describe(date: Date, seconds: number, videos: number, pomodoros: number): string {
        const when = date.toLocaleDateString(undefined, {weekday: 'short', day: 'numeric', month: 'short', year: 'numeric'});
        if (seconds <= 0) {
            return 'No study on ' + when;
        }
        const parts = [this.formatDuration(seconds)];
        if (videos) {
            parts.push(videos + (videos === 1 ? ' video' : ' videos'));
        }
        if (pomodoros) {
            parts.push(pomodoros + (pomodoros === 1 ? ' pomodoro' : ' pomodoros'));
        }
        return parts.join(' · ') + ' on ' + when;
    }

    private formatDays(count: number): string {
        return count + (count === 1 ? ' day' : ' days');
    }

    private formatDuration(seconds: number): string {
        const total = Math.round(seconds);
        if (total < 60) {
            return total + 's';
        }
        const hours = Math.floor(total / 3600);
        const minutes = Math.round((total % 3600) / 60);
        if (!hours) {
            return minutes + 'm';
        }
        return minutes ? hours + 'h ' + minutes + 'm' : hours + 'h';
    }

    /** Only jump to today when the calendar genuinely does not fit; otherwise it stays centred. */
    private scrollToToday() {
        const element = this.scroller?.nativeElement;
        if (element && element.scrollWidth - element.clientWidth > MONTH_LABEL_OVERHANG) {
            element.scrollLeft = element.scrollWidth;
        }
    }
}
