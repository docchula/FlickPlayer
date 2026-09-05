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

/** Everything the settings sheet controls, as kept on this device. */
export interface AppSettings {
    /**
     * Widget keys the user switched off. Absent means visible, so a widget added by a later
     * release is on by default and needs no migration.
     */
    hidden: string[];
    /** Widget keys whose element has been seen at least once on this device. */
    seen: string[];
    fontId: string;
    pomodoroResetHour: number;
    /** The study day the Pomodoro session count currently belongs to. */
    pomodoroDayKey: string;
}

/** The resolved font, mirrored so index.html can paint it before Angular boots. */
export interface AppliedFont {
    id: string;
    stack: string;
    href: string;
    scale: number;
}
