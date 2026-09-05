import {AppSettings, ResetHourOption, WidgetOption} from './settings.model';
import {DEFAULT_FONT_ID} from './fonts';

/**
 * Everything the sheet can switch off. `selectors` name the elements that prove a feature
 * shipped in this build: a widget whose element is nowhere in the page is never offered, so
 * this list may name features that have not been merged yet and will start working on their
 * own once they are.
 */
export const WIDGETS: WidgetOption[] = [
    {
        key: 'pomodoro',
        label: 'Pomodoro timer',
        description: 'The focus timer on a course page.',
        icon: 'timer-outline',
        selectors: ['app-pomodoro-timer'],
    },
    {
        key: 'heatmap',
        label: 'Study heatmap',
        description: 'The activity calendar on the home page.',
        icon: 'calendar-outline',
        selectors: ['app-study-heatmap'],
    },
    {
        key: 'appearance',
        label: 'Theme button',
        description: 'The appearance control in the toolbar.',
        icon: 'color-palette-outline',
        selectors: ['app-theme-menu', 'app-theme-dropdown'],
    },
];

/** A Pomodoro day starts here rather than at midnight, so a late night counts as one sitting. */
export const DEFAULT_RESET_HOUR = 4;

function formatHour(hour: number): string {
    const suffix = hour < 12 ? 'AM' : 'PM';
    const display = hour % 12 === 0 ? 12 : hour % 12;

    return display + ':00 ' + suffix;
}

export const RESET_HOURS: ResetHourOption[] = Array.from({length: 24}, (unused, hour) => ({
    value: hour,
    label: formatHour(hour),
}));

export function defaultSettings(): AppSettings {
    return {
        hidden: [],
        seen: [],
        fontId: DEFAULT_FONT_ID,
        pomodoroResetHour: DEFAULT_RESET_HOUR,
        pomodoroDayKey: '',
    };
}
