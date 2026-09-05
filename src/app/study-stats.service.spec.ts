import {TestBed} from '@angular/core/testing';
import {of} from 'rxjs';

import {AuthService} from './auth.service';
import {
    addDays,
    computeStudyStats,
    mergeDevices,
    StudyDayMap,
    StudyStatsService,
    SyncedDevices,
    toDateKey,
} from './study-stats.service';

function daysFrom(offsets: number[], seconds = 600): StudyDayMap {
    const map: StudyDayMap = {};
    for (const offset of offsets) {
        map[toDateKey(addDays(new Date(), offset))] = {seconds, videoIds: [], pomodoros: 0};
    }
    return map;
}

describe('StudyStatsService', () => {
    beforeEach(() => {
        localStorage.clear();
        TestBed.configureTestingModule({
            providers: [{provide: AuthService, useValue: {user: of(null)}}],
        });
    });

    it('should be created', () => {
        expect(TestBed.inject(StudyStatsService)).toBeTruthy();
    });

    it('should record a watched video against today', () => {
        const service = TestBed.inject(StudyStatsService);
        service.recordVideoProgress(42);
        const today = service.getDays()[toDateKey(new Date())];
        expect(today.videoIds).toEqual([42]);
    });
});

describe('mergeDevices', () => {
    const own: StudyDayMap = {
        '2026-09-01': {seconds: 600, videoIds: [1], pomodoros: 1},
        '2026-09-02': {seconds: 300, videoIds: [2], pomodoros: 0},
    };
    const others: SyncedDevices = {
        phone: {'2026-09-02': {seconds: 900, videos: 2, pomodoros: 1}},
        tablet: {'2026-09-03': {seconds: 120, videos: 1, pomodoros: 0}},
    };

    it('should add every device together for a day they all studied', () => {
        expect(mergeDevices(own, others)['2026-09-02'].seconds).toBe(1200);
        expect(mergeDevices(own, others)['2026-09-02'].pomodoros).toBe(1);
    });

    it('should keep days only one device knows about', () => {
        const merged = mergeDevices(own, others);
        expect(merged['2026-09-01'].seconds).toBe(600);
        expect(merged['2026-09-03'].seconds).toBe(120);
    });

    it('should not let a merge alter this device\'s own record', () => {
        mergeDevices(own, others);
        expect(own['2026-09-02'].seconds).toBe(300);
        expect(own['2026-09-01'].videoIds.length).toBe(1);
    });

    it('should count videos from other devices without their identifiers', () => {
        const merged = mergeDevices(own, others);
        expect(merged['2026-09-02'].videoIds).toEqual([2]);
        expect(merged['2026-09-02'].remoteVideos).toBe(2);
    });

    it('should be unaffected by the order devices arrive in', () => {
        const reversed: SyncedDevices = {tablet: others.tablet, phone: others.phone};
        expect(mergeDevices(own, reversed)['2026-09-02'].seconds)
            .toBe(mergeDevices(own, others)['2026-09-02'].seconds);
    });
});

describe('computeStudyStats', () => {
    const today = toDateKey(new Date());
    const start = toDateKey(addDays(new Date(), -29));

    it('should count a streak that ends today', () => {
        const stats = computeStudyStats(daysFrom([0, -1, -2, -5]), start, today);
        expect(stats.currentStreak).toBe(3);
        expect(stats.longestStreak).toBe(3);
        expect(stats.daysStudied).toBe(4);
    });

    it('should keep the streak alive on a day that has not been studied yet', () => {
        const stats = computeStudyStats(daysFrom([-1, -2]), start, today);
        expect(stats.currentStreak).toBe(2);
    });

    it('should break the streak after a missed day', () => {
        const stats = computeStudyStats(daysFrom([-2, -3]), start, today);
        expect(stats.currentStreak).toBe(0);
        expect(stats.longestStreak).toBe(2);
    });

    it('should total and average only the days studied', () => {
        const stats = computeStudyStats(daysFrom([0, -1], 900), start, today);
        expect(stats.totalSeconds).toBe(1800);
        expect(stats.averageSeconds).toBe(900);
        expect(stats.daysInRange).toBe(30);
    });

    it('should ignore days outside the window', () => {
        const stats = computeStudyStats(daysFrom([0, -40]), start, today);
        expect(stats.daysStudied).toBe(1);
    });
});
