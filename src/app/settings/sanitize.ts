import {FONT_OPTIONS} from './fonts';
import {defaultSettings, WIDGETS} from './settings-presets';
import {AppSettings} from './settings.model';

/** Keep only the keys this build still knows, so a widget dropped later cleans itself up. */
function sanitizeKeys(raw: unknown): string[] {
    const stored = Array.isArray(raw) ? raw : [];

    return WIDGETS.map(widget => widget.key).filter(key => stored.includes(key));
}

/** Accept only values this build understands, so stored data can never break the app. */
export function sanitizeSettings(raw: unknown): AppSettings {
    const fallback = defaultSettings();
    const value = (raw ?? {}) as Partial<AppSettings>;
    const hour = Number(value.pomodoroResetHour);

    return {
        hidden: sanitizeKeys(value.hidden),
        seen: sanitizeKeys(value.seen),
        fontId: FONT_OPTIONS.some(font => font.id === value.fontId)
            ? value.fontId as string
            : fallback.fontId,
        pomodoroResetHour: Number.isInteger(hour) && hour >= 0 && hour < 24 ? hour : fallback.pomodoroResetHour,
        pomodoroDayKey: typeof value.pomodoroDayKey === 'string' ? value.pomodoroDayKey : '',
    };
}
