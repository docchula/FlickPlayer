import {sanitizeSettings} from './sanitize';
import {defaultSettings, DEFAULT_RESET_HOUR} from './settings-presets';
import {nextResetAt, studyDayKey, toDateKey} from './day';

describe('sanitizeSettings', () => {
    it('falls back to the defaults for anything unusable', () => {
        expect(sanitizeSettings(null)).toEqual(defaultSettings());
        expect(sanitizeSettings('not an object')).toEqual(defaultSettings());
    });

    it('drops widget keys this build no longer knows', () => {
        const settings = sanitizeSettings({hidden: ['heatmap', 'gramophone'], seen: ['gramophone']});

        expect(settings.hidden).toEqual(['heatmap']);
        expect(settings.seen).toEqual([]);
    });

    it('treats a widget missing from `hidden` as visible', () => {
        expect(sanitizeSettings({hidden: ['pomodoro']}).hidden).not.toContain('heatmap');
    });

    it('keeps only a font this build offers', () => {
        expect(sanitizeSettings({fontId: 'mali'}).fontId).toBe('mali');
        expect(sanitizeSettings({fontId: 'comic-sans'}).fontId).toBe(defaultSettings().fontId);
    });

    it('rejects a reset hour outside the clock', () => {
        expect(sanitizeSettings({pomodoroResetHour: 0}).pomodoroResetHour).toBe(0);
        expect(sanitizeSettings({pomodoroResetHour: 23}).pomodoroResetHour).toBe(23);
        expect(sanitizeSettings({pomodoroResetHour: 24}).pomodoroResetHour).toBe(DEFAULT_RESET_HOUR);
        expect(sanitizeSettings({pomodoroResetHour: -1}).pomodoroResetHour).toBe(DEFAULT_RESET_HOUR);
        expect(sanitizeSettings({pomodoroResetHour: 4.5}).pomodoroResetHour).toBe(DEFAULT_RESET_HOUR);
    });
});

describe('the study day', () => {
    const hour = 4;

    it('puts the small hours on the day before', () => {
        const lateNight = new Date(2026, 8, 5, 2, 0).getTime();

        expect(studyDayKey(lateNight, hour)).toBe('2026-09-04');
    });

    it('turns over exactly at the chosen hour', () => {
        expect(studyDayKey(new Date(2026, 8, 5, 3, 59).getTime(), hour)).toBe('2026-09-04');
        expect(studyDayKey(new Date(2026, 8, 5, 4, 0).getTime(), hour)).toBe('2026-09-05');
    });

    it('follows local midnight when the hour is zero', () => {
        const justAfterMidnight = new Date(2026, 8, 5, 0, 30).getTime();

        expect(studyDayKey(justAfterMidnight, 0)).toBe('2026-09-05');
        expect(toDateKey(new Date(justAfterMidnight))).toBe('2026-09-05');
    });

    it('reports the next turn as the coming reset hour', () => {
        expect(nextResetAt(new Date(2026, 8, 5, 2, 0).getTime(), hour))
            .toBe(new Date(2026, 8, 5, 4, 0).getTime());
        expect(nextResetAt(new Date(2026, 8, 5, 10, 0).getTime(), hour))
            .toBe(new Date(2026, 8, 6, 4, 0).getTime());
    });
});
