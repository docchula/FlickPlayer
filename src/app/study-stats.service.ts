import {inject, Injectable} from '@angular/core';
import {BehaviorSubject, Observable} from 'rxjs';
import {AuthService} from './auth.service';
import {UserSyncService} from './user-sync.service';
import {ulid} from 'ulid';

/** Aggregated activity for a single calendar day (local time). */
export interface StudyDay {
    seconds: number;
    videoIds: number[];
    pomodoros: number;
    /** Videos counted on other devices, which do not share their identifiers. */
    remoteVideos?: number;
}

/** Activity keyed by local date (YYYY-MM-DD). */
export interface StudyDayMap {
    [date: string]: StudyDay;
}

export interface StudyStats {
    daysStudied: number;
    daysInRange: number;
    totalSeconds: number;
    averageSeconds: number;
    currentStreak: number;
    longestStreak: number;
    busiestDate: string | null;
    busiestSeconds: number;
    pomodoros: number;
    videos: number;
}

export interface HeatmapRange {
    key: string;
    label: string;
    months: number | null;
}

export const HEATMAP_RANGES: HeatmapRange[] = [
    {key: '3m', label: '3 months', months: 3},
    {key: '6m', label: '6 months', months: 6},
    {key: '1y', label: 'Year', months: 12},
    {key: 'all', label: 'All time', months: null},
];

export const DEFAULT_HEATMAP_RANGE = '1y';

export function toDateKey(date: Date): string {
    return date.getFullYear()
        + '-' + String(date.getMonth() + 1).padStart(2, '0')
        + '-' + String(date.getDate()).padStart(2, '0');
}

export function fromDateKey(key: string): Date {
    const [year, month, day] = key.split('-').map(Number);
    return new Date(year, month - 1, day);
}

export function addDays(date: Date, amount: number): Date {
    const result = new Date(date.getTime());
    result.setDate(result.getDate() + amount);
    return result;
}

/** Number of calendar days from `from` to `to`, inclusive. */
export function daysBetween(from: Date, to: Date): number {
    const start = new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime();
    const end = new Date(to.getFullYear(), to.getMonth(), to.getDate()).getTime();
    return Math.round((end - start) / 86400000) + 1;
}

function emptyDay(): StudyDay {
    return {seconds: 0, videoIds: [], pomodoros: 0};
}

/** What one device contributes, in the compact shape that travels between devices. */
export interface SyncedDay {
    seconds: number;
    videos: number;
    pomodoros: number;
}

export type SyncedDayMap = Record<string, SyncedDay>;
export type SyncedDevices = Record<string, SyncedDayMap>;

function sanitizeSyncedDevices(raw: unknown, skipDeviceId: string): SyncedDevices {
    const devices: SyncedDevices = {};
    if (!raw || typeof raw !== 'object') {
        return devices;
    }
    for (const [deviceId, dayMap] of Object.entries(raw as Record<string, unknown>)) {
        if (deviceId === skipDeviceId || !dayMap || typeof dayMap !== 'object') {
            continue;
        }
        const days: SyncedDayMap = {};
        for (const [date, day] of Object.entries(dayMap as Record<string, unknown>)) {
            const value = (day ?? {}) as Partial<SyncedDay>;
            days[date] = {
                seconds: Number(value.seconds) || 0,
                videos: Number(value.videos) || 0,
                pomodoros: Number(value.pomodoros) || 0,
            };
        }
        devices[deviceId] = days;
    }
    return devices;
}

/**
 * The calendar shown is this device's own record plus every other device's, added together.
 * Each device only ever writes its own entry, so no device can overwrite another's history
 * and the sum stays right whatever order they sync in.
 */
export function mergeDevices(own: StudyDayMap, others: SyncedDevices): StudyDayMap {
    const merged: StudyDayMap = {};
    for (const [date, day] of Object.entries(own)) {
        merged[date] = {...day, videoIds: [...day.videoIds]};
    }
    for (const days of Object.values(others)) {
        for (const [date, day] of Object.entries(days)) {
            const target = merged[date] ?? emptyDay();
            target.seconds += day.seconds;
            target.pomodoros += day.pomodoros;
            target.remoteVideos = (target.remoteVideos ?? 0) + day.videos;
            merged[date] = target;
        }
    }
    return merged;
}

/**
 * Summarise activity between two date keys (both inclusive).
 * Streaks are measured inside the window, so they follow the selected range.
 */
export function computeStudyStats(days: StudyDayMap, startKey: string, endKey: string): StudyStats {
    const studied = Object.keys(days)
        .filter(key => key >= startKey && key <= endKey && days[key].seconds > 0)
        .sort();

    const stats: StudyStats = {
        daysStudied: studied.length,
        daysInRange: daysBetween(fromDateKey(startKey), fromDateKey(endKey)),
        totalSeconds: 0,
        averageSeconds: 0,
        currentStreak: 0,
        longestStreak: 0,
        busiestDate: null,
        busiestSeconds: 0,
        pomodoros: 0,
        videos: 0,
    };

    const watchedVideos = new Set<number>();
    let run = 0;
    let previous: string | null = null;
    for (const key of studied) {
        const day = days[key];
        stats.totalSeconds += day.seconds;
        stats.pomodoros += day.pomodoros;
        day.videoIds.forEach(id => watchedVideos.add(id));
        if (day.seconds > stats.busiestSeconds) {
            stats.busiestSeconds = day.seconds;
            stats.busiestDate = key;
        }
        run = (previous && toDateKey(addDays(fromDateKey(previous), 1)) === key) ? run + 1 : 1;
        stats.longestStreak = Math.max(stats.longestStreak, run);
        previous = key;
    }

    stats.videos = watchedVideos.size;
    stats.averageSeconds = studied.length ? Math.round(stats.totalSeconds / studied.length) : 0;

    // The streak may start today or yesterday — a day without study only breaks it once it is over.
    let cursor = fromDateKey(endKey);
    if (!studied.includes(endKey)) {
        cursor = addDays(cursor, -1);
    }
    while (days[toDateKey(cursor)]?.seconds > 0 && toDateKey(cursor) >= startKey) {
        stats.currentStreak++;
        cursor = addDays(cursor, -1);
    }

    return stats;
}

/**
 * Tracks how much time the user spends studying each day and keeps it in local storage.
 *
 * Video playback and the Pomodoro timer both report activity as they run. Time is credited
 * from the wall clock gap between reports, so two sources running at once are counted once.
 */
@Injectable({
    providedIn: 'root',
})
export class StudyStatsService {
    private readonly STORAGE_KEY_PREFIX = 'studyStats_';
    private readonly GUEST_ID = 'guest';
    /** Gaps longer than this mean the user stopped studying, so nothing is credited. */
    private readonly IDLE_GAP_MS = 10000;
    private readonly SAVE_INTERVAL_MS = 10000;
    private readonly RETENTION_DAYS = 1100;
    /** How much history travels between devices, keeping the shared document small. */
    private readonly SYNC_RETENTION_DAYS = 800;
    private readonly DEVICE_KEY = 'flickDevice';

    private sync = inject(UserSyncService);
    private currentUserId = this.GUEST_ID;
    private days: StudyDayMap = {};
    private otherDevices: SyncedDevices = {};
    private lastActiveAt = 0;
    private lastSavedAt = 0;
    private syncDirty = false;
    private readonly deviceId = this.resolveDeviceId();

    private readonly activitySubject = new BehaviorSubject<StudyDayMap>({});
    readonly activity$: Observable<StudyDayMap> = this.activitySubject.asObservable();

    constructor() {
        this.days = this.load(this.currentUserId);
        this.publish(false);

        inject(AuthService).user.subscribe(user => {
            if (user?.uid) {
                this.loadForUser(user.uid);
                void this.pullRemote();
            } else if (this.currentUserId !== this.GUEST_ID) {
                this.clearForUser();
            }
        });

        if (typeof document !== 'undefined') {
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'hidden') {
                    this.save();
                }
            });
            window.addEventListener('pagehide', () => this.save());
        }
    }

    /**
     * Switch to a signed-in user, merging anything recorded before authentication resolved.
     */
    loadForUser(uid: string): void {
        if (this.currentUserId === uid) {
            return;
        }
        const pending = this.currentUserId === this.GUEST_ID ? this.days : {};
        this.save();
        this.currentUserId = uid;
        this.days = this.load(uid);
        for (const key of Object.keys(pending)) {
            const target = this.days[key] ?? emptyDay();
            target.seconds += pending[key].seconds;
            target.pomodoros += pending[key].pomodoros;
            target.videoIds = [...new Set([...target.videoIds, ...pending[key].videoIds])];
            this.days[key] = target;
        }
        if (Object.keys(pending).length) {
            this.remove(this.GUEST_ID);
            this.save(true);
        }
        this.publish(false);
    }

    /** Merge in what other devices have recorded. One read, shared with the theme. */
    private async pullRemote(): Promise<void> {
        this.sync.attach(this.currentUserId);
        const remote = await this.sync.read();
        this.otherDevices = sanitizeSyncedDevices(remote?.study?.devices, this.deviceId);
        this.publish(false);
    }

    /** Detach the signed-in user's history (call on sign out). */
    clearForUser(): void {
        this.save();
        this.sync.detach();
        this.currentUserId = this.GUEST_ID;
        this.days = this.load(this.GUEST_ID);
        this.otherDevices = {};
        this.lastActiveAt = 0;
        this.publish(false);
    }

    /** Report that a video is still playing. Called repeatedly while playback runs. */
    recordVideoProgress(videoId: number | null): void {
        const today = this.credit();
        if (videoId != null && !today.videoIds.includes(videoId)) {
            today.videoIds.push(videoId);
            this.syncDirty = true;
            this.publish(true);
        }
    }

    /** Report that a Pomodoro study phase is running. Called once per second. */
    recordFocusTick(): void {
        this.credit();
    }

    /** Report a finished Pomodoro study phase. */
    recordFocusSession(): void {
        const today = this.credit();
        today.pomodoros++;
        this.syncDirty = true;
        this.publish(true);
    }

    /** Every device's record, added together. */
    getDays(): StudyDayMap {
        return mergeDevices(this.days, this.otherDevices);
    }

    /** Earliest day with any recorded activity, on any device. */
    getFirstActiveDate(): Date | null {
        const days = this.getDays();
        const keys = Object.keys(days).filter(key => days[key].seconds > 0).sort();
        return keys.length ? fromDateKey(keys[0]) : null;
    }

    private credit(): StudyDay {
        const now = Date.now();
        const elapsed = now - this.lastActiveAt;
        this.lastActiveAt = now;

        const key = toDateKey(new Date(now));
        const today = this.days[key] ?? emptyDay();
        this.days[key] = today;

        if (elapsed > 0 && elapsed <= this.IDLE_GAP_MS) {
            today.seconds += elapsed / 1000;
            this.syncDirty = true;
            if (now - this.lastSavedAt > this.SAVE_INTERVAL_MS) {
                this.publish(true);
            }
        }
        return today;
    }

    private publish(persist: boolean): void {
        if (persist) {
            this.save(true);
        }
        this.activitySubject.next(mergeDevices(this.days, this.otherDevices));
    }

    private resolveDeviceId(): string {
        try {
            const stored = localStorage.getItem(this.DEVICE_KEY);
            if (stored) {
                return stored;
            }
            const created = ulid();
            localStorage.setItem(this.DEVICE_KEY, created);
            return created;
        } catch {
            return ulid();
        }
    }

    /** This device's own contribution, trimmed to what is worth sharing. */
    private syncPayload(): SyncedDayMap {
        const oldest = toDateKey(addDays(new Date(), -this.SYNC_RETENTION_DAYS));
        const days: SyncedDayMap = {};
        for (const [date, day] of Object.entries(this.days)) {
            if (date >= oldest && day.seconds > 0) {
                days[date] = {
                    seconds: Math.round(day.seconds),
                    videos: day.videoIds.length,
                    pomodoros: day.pomodoros,
                };
            }
        }
        return days;
    }

    private load(uid: string): StudyDayMap {
        try {
            const raw = localStorage.getItem(this.STORAGE_KEY_PREFIX + uid);
            if (!raw) {
                return {};
            }
            const parsed = JSON.parse(raw);
            const days: StudyDayMap = {};
            for (const key of Object.keys(parsed?.days ?? {})) {
                const day = parsed.days[key];
                days[key] = {
                    seconds: Number(day?.seconds) || 0,
                    videoIds: Array.isArray(day?.videoIds) ? day.videoIds : [],
                    pomodoros: Number(day?.pomodoros) || 0,
                };
            }
            return days;
        } catch {
            return {};
        }
    }

    private save(force = false): void {
        if (!force && !Object.keys(this.days).length) {
            return;
        }
        if (this.syncDirty && this.currentUserId !== this.GUEST_ID) {
            this.syncDirty = false;
            this.sync.queue({study: {devices: {[this.deviceId]: this.syncPayload()}}});
        }
        this.lastSavedAt = Date.now();
        const oldest = toDateKey(addDays(new Date(), -this.RETENTION_DAYS));
        const days: StudyDayMap = {};
        for (const key of Object.keys(this.days)) {
            if (key >= oldest) {
                days[key] = {...this.days[key], seconds: Math.round(this.days[key].seconds)};
            }
        }
        try {
            localStorage.setItem(this.STORAGE_KEY_PREFIX + this.currentUserId, JSON.stringify({version: 1, days}));
        } catch {
            // Storage may be full or disabled — activity for this session is still kept in memory.
        }
    }

    private remove(uid: string): void {
        try {
            localStorage.removeItem(this.STORAGE_KEY_PREFIX + uid);
        } catch {
            // Ignore
        }
    }
}
