import {PlayStatDay, PlayStatHour, PlayStats, PlayStatValues} from '../man.service';

// Dates are Y-m-d strings in the server timezone. They are handled as UTC dates here,
// so the grid does not shift with the timezone of the device.

export type Level = 0 | 1 | 2 | 3 | 4;

/** Minutes of actual watching at which a cell moves up a level. */
export const HOUR_THRESHOLDS = [1, 10, 30, 45];
export const DAY_THRESHOLDS = [1, 30, 60, 120];

export interface HourCell {
    date: string;
    hour: number;
    sessions: number;
    video_seconds: number;
    actual_seconds: number;
    level: Level;
}

export interface RecentRow {
    date: string;
    label: string; // e.g. "Mon"
    /** 24 entries; null for hours that have not started yet */
    cells: (HourCell | null)[];
}

export interface DayCell {
    date: string;
    sessions: number;
    video_seconds: number;
    actual_seconds: number;
    level: Level;
}

export interface WeekColumn {
    /** Seven entries, Sunday first. Null where the day is outside the range. */
    days: (DayCell | null)[];
    /** Month name when a month starts in this column. */
    monthLabel: string | null;
}

const DAY_MS = 86400000;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function parseDate(date: string): number {
    const [y, m, d] = date.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
}

function formatDate(ms: number): string {
    return new Date(ms).toISOString().substring(0, 10);
}

export function level(seconds: number, thresholds: number[]): Level {
    const minutes = seconds / 60;
    let result = 0;
    for (const threshold of thresholds) {
        if (minutes >= threshold) result++;
    }
    return result as Level;
}

/**
 * Level relative to `max`, so the busiest cell gets the darkest color and any activity is at least level 1.
 */
export function relativeLevel(seconds: number, max: number): Level {
    if (seconds <= 0 || max <= 0) return 0;
    return Math.min(4, Math.ceil(4 * seconds / max)) as Level;
}

/** Most seconds actually watched in a single day, from `from` (Y-m-d) on when given. */
export function maxDayActual(stats: PlayStats, from?: string): number {
    return Math.max(0, ...stats.days.filter(d => !from || d.date >= from).map(d => d.actual_seconds));
}

/** Most seconds actually watched in a single hour of the last 7 days. */
export function maxHourActual(stats: PlayStats): number {
    return Math.max(0, ...stats.recent_hours.map(h => h.actual_seconds));
}

export interface HourKey {
    date: string;
    hour: number;
}

/**
 * The current date and hour in the server timezone, taking the UTC offset from `updated_at`
 * (e.g. `+07:00`), since that is the only timezone information the API gives.
 */
export function serverNow(stats: PlayStats, nowMs = Date.now()): HourKey {
    const match = /([+-])(\d{2}):?(\d{2})$/.exec(stats.updated_at);
    const offsetMinutes = match ? (match[1] === '-' ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3])) : 0;
    const shifted = new Date(nowMs + offsetMinutes * 60000);
    return {date: formatDate(shifted.getTime()), hour: shifted.getUTCHours()};
}

/**
 * The last 7 days (`to` - 6 days up to `to`), one row per day with 24 hour cells.
 * Levels use fixed thresholds, or are relative to `max` when it is given.
 * Hours after `now` are left out (null) when it is given.
 */
export function buildRecentGrid(stats: PlayStats, max?: number, now?: HourKey): RecentRow[] {
    const byKey = new Map<string, PlayStatHour>();
    for (const h of stats.recent_hours) {
        byKey.set(`${h.date}#${h.hour}`, h);
    }
    const end = parseDate(stats.to);
    const rows: RecentRow[] = [];
    for (let i = 6; i >= 0; i--) {
        const ms = end - i * DAY_MS;
        const date = formatDate(ms);
        const cells: (HourCell | null)[] = [];
        for (let hour = 0; hour < 24; hour++) {
            if (now && (date > now.date || (date === now.date && hour > now.hour))) {
                cells.push(null);
                continue;
            }
            const h = byKey.get(`${date}#${hour}`);
            cells.push({
                date, hour,
                sessions: h?.sessions ?? 0,
                video_seconds: h?.video_seconds ?? 0,
                actual_seconds: h?.actual_seconds ?? 0,
                level: max === undefined
                    ? level(h?.actual_seconds ?? 0, HOUR_THRESHOLDS)
                    : relativeLevel(h?.actual_seconds ?? 0, max),
            });
        }
        rows.push({date, label: WEEKDAYS[new Date(ms).getUTCDay()], cells});
    }
    return rows;
}

/**
 * Week columns from `from` to `to`, Sunday first, like a contribution calendar.
 * Levels use fixed thresholds, or are relative to `max` when it is given.
 * Starts at `from` (Y-m-d) instead of `stats.from` when given.
 */
export function buildYearGrid(stats: PlayStats, max?: number, from?: string): WeekColumn[] {
    const byDate = new Map<string, PlayStatDay>();
    for (const d of stats.days) {
        byDate.set(d.date, d);
    }
    const start = parseDate(from ?? stats.from);
    const end = parseDate(stats.to);
    const columns: WeekColumn[] = [];
    let weekStart = start - new Date(start).getUTCDay() * DAY_MS;
    let lastMonth = -1;
    for (; weekStart <= end; weekStart += 7 * DAY_MS) {
        const days: (DayCell | null)[] = [];
        let monthLabel: string | null = null;
        for (let i = 0; i < 7; i++) {
            const ms = weekStart + i * DAY_MS;
            if (ms < start || ms > end) {
                days.push(null);
                continue;
            }
            const date = formatDate(ms);
            const d = byDate.get(date);
            days.push({
                date,
                sessions: d?.sessions ?? 0,
                video_seconds: d?.video_seconds ?? 0,
                actual_seconds: d?.actual_seconds ?? 0,
                level: max === undefined
                    ? level(d?.actual_seconds ?? 0, DAY_THRESHOLDS)
                    : relativeLevel(d?.actual_seconds ?? 0, max),
            });
            const month = new Date(ms).getUTCMonth();
            if (month !== lastMonth) {
                lastMonth = month;
                monthLabel = MONTHS[month];
            }
        }
        columns.push({days, monthLabel});
    }
    // Two adjacent labels would overlap, so the leading partial month gives way
    if (columns.length > 1 && columns[1].monthLabel) {
        columns[0].monthLabel = null;
    }
    return columns;
}

export type StatsRange = '1y' | '6m' | '1m';

export const STATS_RANGES: { value: StatsRange, label: string, months: number }[] = [
    {value: '1y', label: '1 year', months: 12},
    {value: '6m', label: '6 months', months: 6},
    {value: '1m', label: '1 month', months: 1},
];

/**
 * First day of the period of `months` months that ends at `stats.to`, never before `stats.from`.
 * The period starts the day after the same day of the month `months` back, e.g. 1 month up to Oct 10 starts Sep 11.
 */
export function rangeStart(stats: PlayStats, months: number): string {
    const end = new Date(parseDate(stats.to));
    const back = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - months, 1));
    // Months differ in length, so stay within the month that was landed on
    const monthEnd = new Date(Date.UTC(back.getUTCFullYear(), back.getUTCMonth() + 1, 0)).getUTCDate();
    back.setUTCDate(Math.min(end.getUTCDate(), monthEnd));
    const first = formatDate(back.getTime() + DAY_MS);
    // Y-m-d strings compare in date order
    return first > stats.from ? first : stats.from;
}

/** Totals from `first` (Y-m-d) up to `stats.to`, summed from the daily data. */
export function sumFrom(stats: PlayStats, first: string): PlayStatValues {
    const sum: PlayStatValues = {sessions: 0, video_seconds: 0, actual_seconds: 0};
    for (const d of stats.days) {
        if (d.date >= first && d.date <= stats.to) {
            sum.sessions += d.sessions;
            sum.video_seconds += d.video_seconds;
            sum.actual_seconds += d.actual_seconds;
        }
    }
    return sum;
}

/** Totals of the last 7 days (`to` - 6 days up to `to`). */
export function sumRecent(stats: PlayStats): PlayStatValues {
    return sumFrom(stats, formatDate(parseDate(stats.to) - 6 * DAY_MS));
}

/** Average playback rate: video seconds per second actually watched. Null without activity. */
export function averageSpeed(values: PlayStatValues): number | null {
    return values.actual_seconds > 0 ? values.video_seconds / values.actual_seconds : null;
}

/** e.g. "Tue 7 Oct 2026" */
export function formatDay(date: string): string {
    const ms = parseDate(date);
    const d = new Date(ms);
    return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
