import {ActivityRange, ActivityRangeOption, AppSettings, ResetHourOption, SessionModeOption, WidgetOption} from './settings.model';
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
        description: 'The focus timer for study sessions.',
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
        key: 'activity',
        label: 'Activity heatmap',
        description: 'Your last 7 days of viewing, on the home page.',
        icon: 'grid-outline',
        selectors: ['ion-card.play-stats-card'],
    },
    {
        key: 'appearance',
        label: 'Theme button',
        description: 'The appearance control in the toolbar.',
        icon: 'color-palette-outline',
        selectors: ['app-theme-menu', 'app-theme-dropdown'],
    },
];

/** Switched off until the reader turns them on. Keep in step with the boot script in index.html. */
export const DEFAULT_HIDDEN = ['pomodoro', 'heatmap'];

/** A Pomodoro day starts here rather than at midnight, so a late night counts as one sitting. */
export const DEFAULT_RESET_HOUR = 4;

function formatHour(hour: number): string {
    const suffix = hour < 12 ? 'AM' : 'PM';
    const display = hour % 12 === 0 ? 12 : hour % 12;

    return display + ':00 ' + suffix;
}

/** Whether the Pomodoro timer pauses when the reader leaves the tab, in the words the sheet uses. */
export const SESSION_MODE_OPTIONS: SessionModeOption[] = [
    {
        value: 'lecture',
        label: 'Flick only',
        hint: 'The timer pauses when you leave this tab, only time spent on Flick counts.',
    },
    {
        value: 'elsewhere',
        label: 'Studying elsewhere',
        hint: 'The timer keeps running while you use other tabs and apps.',
    },
];

export const RESET_HOURS: ResetHourOption[] = Array.from({length: 24}, (unused, hour) => ({
    value: hour,
    label: formatHour(hour),
}));

/** The periods the activity heatmap on the home page can cover, longest first as in the activity window. */
export const ACTIVITY_RANGES: ActivityRangeOption[] = [
    {value: '1y', label: 'Last year', months: 12},
    {value: '6m', label: 'Last 6 months', months: 6},
    {value: '1m', label: 'Last month', months: 1},
    {value: '7d', label: 'Last 7 days', months: null},
];

/** What the home page showed before the period could be chosen. */
export const DEFAULT_ACTIVITY_RANGE: ActivityRange = '7d';

export function defaultSettings(): AppSettings {
    return {
        hidden: [...DEFAULT_HIDDEN],
        seen: [],
        fontId: DEFAULT_FONT_ID,
        pomodoroResetHour: DEFAULT_RESET_HOUR,
        pomodoroDayKey: '',
        activityRange: DEFAULT_ACTIVITY_RANGE,
    };
}
