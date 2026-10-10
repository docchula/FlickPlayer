import {PlayStats} from '../man.service';
import {
    averageSpeed, buildRecentGrid, buildYearGrid, formatDay, level, maxDayActual, maxHourActual, rangeStart, relativeLevel, serverNow, sumFrom, sumRecent,
} from './play-stats';

describe('play-stats', () => {
    const stats = (over: Partial<PlayStats> = {}): PlayStats => ({
        from: '2025-10-11', // a Saturday
        to: '2026-10-10', // a Saturday
        updated_at: '2026-10-10T12:00:00+07:00',
        total: {sessions: 0, video_seconds: 0, actual_seconds: 0},
        days: [],
        recent_hours: [],
        ...over,
    });

    describe('level', () => {
        it('maps minutes onto thresholds', () => {
            const t = [1, 30, 60, 120];
            expect(level(0, t)).toBe(0);
            expect(level(59, t)).toBe(0);
            expect(level(60, t)).toBe(1);
            expect(level(30 * 60, t)).toBe(2);
            expect(level(60 * 60, t)).toBe(3);
            expect(level(500 * 60, t)).toBe(4);
        });
    });

    describe('serverNow', () => {
        it('uses the UTC offset of updated_at', () => {
            // 2026-10-10 18:30 UTC is 2026-10-11 01:30 at +07:00
            const now = Date.UTC(2026, 9, 10, 18, 30);

            expect(serverNow(stats({updated_at: '2026-10-10T12:00:00+07:00'}), now)).toEqual({date: '2026-10-11', hour: 1});
            expect(serverNow(stats({updated_at: '2026-10-10T12:00:00-05:00'}), now)).toEqual({date: '2026-10-10', hour: 13});
            expect(serverNow(stats({updated_at: '2026-10-10T12:00:00Z'}), now)).toEqual({date: '2026-10-10', hour: 18});
        });
    });

    describe('relativeLevel', () => {
        it('gives the busiest cell the top level and any activity at least level 1', () => {
            expect(relativeLevel(0, 100)).toBe(0);
            expect(relativeLevel(1, 100)).toBe(1);
            expect(relativeLevel(25, 100)).toBe(1);
            expect(relativeLevel(26, 100)).toBe(2);
            expect(relativeLevel(75, 100)).toBe(3);
            expect(relativeLevel(100, 100)).toBe(4);
        });

        it('is 0 when there is no maximum', () => {
            expect(relativeLevel(0, 0)).toBe(0);
        });
    });

    describe('max helpers', () => {
        it('find the busiest day and hour', () => {
            const s = stats({
                days: [
                    {date: '2026-10-09', sessions: 1, video_seconds: 100, actual_seconds: 50},
                    {date: '2026-10-10', sessions: 1, video_seconds: 900, actual_seconds: 600},
                ],
                recent_hours: [{date: '2026-10-10', hour: 9, sessions: 1, video_seconds: 900, actual_seconds: 600}],
            });

            expect(maxDayActual(s)).toBe(600);
            expect(maxHourActual(s)).toBe(600);
        });

        it('find the busiest day from a given date on', () => {
            const s = stats({
                days: [
                    {date: '2026-09-01', sessions: 1, video_seconds: 900, actual_seconds: 900},
                    {date: '2026-10-10', sessions: 1, video_seconds: 100, actual_seconds: 60},
                ],
            });

            expect(maxDayActual(s)).toBe(900);
            expect(maxDayActual(s, '2026-10-01')).toBe(60);
        });

        it('are 0 without activity', () => {
            expect(maxDayActual(stats())).toBe(0);
            expect(maxHourActual(stats())).toBe(0);
        });
    });

    describe('buildRecentGrid', () => {
        it('has 7 days of 24 hours ending today', () => {
            const rows = buildRecentGrid(stats());

            expect(rows.length).toBe(7);
            expect(rows[0].date).toBe('2026-10-04');
            expect(rows[6].date).toBe('2026-10-10');
            expect(rows[6].label).toBe('Sat');
            expect(rows.every(r => r.cells.length === 24)).toBeTrue();
        });

        it('leaves out hours after now', () => {
            const rows = buildRecentGrid(stats(), undefined, {date: '2026-10-10', hour: 9});

            expect(rows[6].cells.filter(c => c).length).toBe(10); // 0:00 to 9:00
            expect(rows[6].cells[9]).not.toBeNull();
            expect(rows[6].cells[10]).toBeNull();
            expect(rows[6].cells.length).toBe(24);
            expect(rows[5].cells.every(c => c)).toBeTrue();
        });

        it('shows every hour without a given now', () => {
            expect(buildRecentGrid(stats())[6].cells.every(c => c)).toBeTrue();
        });

        it('scales levels to the given maximum', () => {
            const recent_hours = [
                {date: '2026-10-09', hour: 14, sessions: 1, video_seconds: 600, actual_seconds: 600},
                {date: '2026-10-09', hour: 15, sessions: 1, video_seconds: 100, actual_seconds: 100},
            ];
            const rows = buildRecentGrid(stats({recent_hours}), 600);

            expect(rows[5].cells[14].level).toBe(4);
            expect(rows[5].cells[15].level).toBe(1);
        });

        it('fills cells from the hourly data', () => {
            const rows = buildRecentGrid(stats({
                recent_hours: [{date: '2026-10-09', hour: 14, sessions: 2, video_seconds: 3000, actual_seconds: 1800}],
            }));

            const cell = rows[5].cells[14];
            expect(cell.sessions).toBe(2);
            expect(cell.video_seconds).toBe(3000);
            expect(cell.level).toBe(3);
            expect(rows[5].cells[13].level).toBe(0);
        });
    });

    describe('buildYearGrid', () => {
        it('starts on Sunday and pads days outside the range', () => {
            const columns = buildYearGrid(stats());

            // 2025-10-11 is a Saturday, so the first column only holds that day
            expect(columns[0].days.slice(0, 6).every(d => d === null)).toBeTrue();
            expect(columns[0].days[6].date).toBe('2025-10-11');
            // 2026-10-10 is a Saturday, so the last column is full
            expect(columns[columns.length - 1].days[6].date).toBe('2026-10-10');
            expect(columns.every(c => c.days.length === 7)).toBeTrue();
        });

        it('scales levels to the given maximum', () => {
            const columns = buildYearGrid(stats({
                days: [{date: '2026-10-10', sessions: 1, video_seconds: 600, actual_seconds: 300}],
            }), 600);

            expect(columns[columns.length - 1].days[6].level).toBe(2);
        });

        it('fills days from the daily data', () => {
            const columns = buildYearGrid(stats({
                days: [{date: '2026-10-10', sessions: 3, video_seconds: 9000, actual_seconds: 7200}],
            }));

            const last = columns[columns.length - 1].days[6];
            expect(last.sessions).toBe(3);
            expect(last.level).toBe(4);
        });

        it('labels the first column and each column where a month starts', () => {
            const labels = buildYearGrid(stats()).map(c => c.monthLabel).filter(Boolean);

            expect(labels[0]).toBe('Oct');
            expect(labels[1]).toBe('Nov');
            expect(labels.length).toBe(13);
        });

        it('drops the first label when the next column starts a month', () => {
            const columns = buildYearGrid(stats({from: '2025-10-19', to: '2025-11-08'}));

            expect(columns[0].monthLabel).toBeNull();
            expect(columns[1].monthLabel).toBe('Nov');
        });

        it('starts at the given date instead of the first day of the data', () => {
            const columns = buildYearGrid(stats(), undefined, '2026-10-04');

            expect(columns.length).toBe(1);
            expect(columns[0].days[0].date).toBe('2026-10-04');
        });

        it('does not depend on the timezone of the device', () => {
            const columns = buildYearGrid(stats({from: '2026-10-04', to: '2026-10-10'}));

            expect(columns.length).toBe(1);
            expect(columns[0].days.map(d => d.date)).toEqual([
                '2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10',
            ]);
        });
    });

    describe('sumRecent', () => {
        it('sums only the last 7 days', () => {
            const sum = sumRecent(stats({
                days: [
                    {date: '2026-10-03', sessions: 9, video_seconds: 900, actual_seconds: 900}, // 8 days ago
                    {date: '2026-10-04', sessions: 1, video_seconds: 200, actual_seconds: 100},
                    {date: '2026-10-10', sessions: 2, video_seconds: 600, actual_seconds: 300},
                ],
            }));

            expect(sum).toEqual({sessions: 3, video_seconds: 800, actual_seconds: 400});
        });
    });

    describe('rangeStart', () => {
        it('starts the day after the same day of the month back', () => {
            expect(rangeStart(stats(), 6)).toBe('2026-04-11');
            expect(rangeStart(stats(), 1)).toBe('2026-09-11');
        });

        it('stays within the month that is landed on', () => {
            // One month before Mar 31 is Feb 28, so the period starts on Mar 1
            expect(rangeStart(stats({to: '2026-03-31'}), 1)).toBe('2026-03-01');
        });

        it('never starts before the first day of the data', () => {
            expect(rangeStart(stats(), 12)).toBe('2025-10-11');
            expect(rangeStart(stats({from: '2026-08-01'}), 6)).toBe('2026-08-01');
        });
    });

    describe('sumFrom', () => {
        it('sums the days from the given date up to today', () => {
            const sum = sumFrom(stats({
                days: [
                    {date: '2026-09-10', sessions: 1, video_seconds: 100, actual_seconds: 50},
                    {date: '2026-09-11', sessions: 2, video_seconds: 200, actual_seconds: 100},
                    {date: '2026-10-10', sessions: 3, video_seconds: 300, actual_seconds: 150},
                ],
            }), '2026-09-11');

            expect(sum).toEqual({sessions: 5, video_seconds: 500, actual_seconds: 250});
        });
    });

    describe('averageSpeed', () => {
        it('is video time over actual time', () => {
            expect(averageSpeed({sessions: 1, video_seconds: 150, actual_seconds: 100})).toBe(1.5);
        });

        it('is null without activity', () => {
            expect(averageSpeed({sessions: 0, video_seconds: 0, actual_seconds: 0})).toBeNull();
        });
    });

    it('formatDay() writes the weekday and date', () => {
        expect(formatDay('2026-10-07')).toBe('Wed 7 Oct 2026');
    });
});
