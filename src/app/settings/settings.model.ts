import {SessionMode} from '../pomodoro-session-mode.service';

/** A screen element the user can switch off. */
export interface WidgetOption {
    key: string;
    label: string;
    description: string;
    icon: string;
    /** Any one of these existing in the page proves the feature shipped in this build. */
    selectors: string[];
}

/** A choice in the font picker. A font without `google` is already on the device. */
export interface FontOption {
    id: string;
    name: string;
    /** Empty for the default, which drops the override instead of setting one. */
    stack: string;
    google?: string;
    /** Corrects families that render much smaller than the rest at the same size. */
    scale?: number;
}

export interface ResetHourOption {
    value: number;
    label: string;
}

export interface SessionModeOption {
    value: SessionMode;
    label: string;
    hint: string;
}

/** How much of the reader's viewing the activity heatmap on the home page covers. */
export type ActivityRange = '1y' | '6m' | '1m' | '7d';

export interface ActivityRangeOption {
    value: ActivityRange;
    label: string;
    /** Months back from today, as the activity window counts them; null for the last 7 days, which are shown by the hour. */
    months: number | null;
}

/** Everything the settings sheet controls, as kept on this device. */
export interface AppSettings {
    /**
     * Widget keys switched off, starting from DEFAULT_HIDDEN. Absent means visible, so a widget
     * added by a later release is on by default and needs no migration.
     */
    hidden: string[];
    /** Widget keys whose element has been seen at least once on this device. */
    seen: string[];
    fontId: string;
    pomodoroResetHour: number;
    /** The study day the Pomodoro session count currently belongs to. */
    pomodoroDayKey: string;
    activityRange: ActivityRange;
}

/** The resolved font, mirrored so index.html can paint it before Angular boots. */
export interface AppliedFont {
    id: string;
    stack: string;
    href: string;
    scale: number;
}
