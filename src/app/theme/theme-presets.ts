import {
    BackgroundFitOption,
    BaseScheme,
    ColorScheme,
    CustomTheme,
    SemanticRole,
    SurfaceSteps,
    ThemeBackground,
    ThemeModeOption,
    ThemeSettings,
    ThemeTemplate,
} from './theme.model';

/**
 * Neutral starting palettes. Light, dark and system render exactly these, which keeps the
 * standard modes identical to the app as it shipped.
 */
export const BASE_SCHEMES: Record<ColorScheme, BaseScheme> = {
    light: {
        background: '#ffffff',
        text: '#000000',
        roles: {
            primary: '#3880ff',
            secondary: '#3dc2ff',
            tertiary: '#5260ff',
            success: '#2dd36f',
            warning: '#ffc409',
            danger: '#eb445a',
            dark: '#222428',
            medium: '#92949c',
            light: '#f4f5f8',
        },
    },
    dark: {
        background: '#121212',
        text: '#ffffff',
        roles: {
            primary: '#428cff',
            secondary: '#50c8ff',
            tertiary: '#6a64ff',
            success: '#2fdf75',
            warning: '#ffd534',
            danger: '#ff4961',
            dark: '#f4f5f8',
            medium: '#989aa2',
            light: '#222428',
        },
    },
};

/**
 * Surfaces are placed relative to whatever the page background ends up being, so a light or
 * dark background always keeps cards, items and toolbars separated from it.
 */
export const SURFACE_STEPS: Record<ColorScheme, SurfaceSteps> = {
    light: {card: 0, item: 0, toolbar: 0},
    dark: {card: 0.05, item: 0.033, toolbar: 0},
};

/** How far each surface is blended towards the accent at full intensity. */
export const ACCENT_WEIGHTS: Record<string, number> = {
    background: 0.06,
    item: 0.1,
    card: 0.1,
    toolbar: 0.22,
    text: 0.3,
};

/**
 * Roles that carry the chosen colour directly. The rest keep their own meaning and are
 * only blended towards the accent by the theme intensity.
 */
export const ACCENT_ROLES: SemanticRole[] = ['primary', 'secondary', 'tertiary'];

export const ROLE_WEIGHTS: Record<SemanticRole, number> = {
    primary: 1,
    secondary: 1,
    tertiary: 1,
    success: 0.18,
    warning: 0.18,
    danger: 0.18,
    dark: 0.15,
    medium: 0.2,
    light: 0.15,
};

/** Ionic's own derivation of the shade and tint variants of a colour. */
export const SHADE_AMOUNT = 0.12;
export const TINT_AMOUNT = 0.1;
/** Above this relative luminance a colour takes black text rather than white. */
export const CONTRAST_LUMINANCE_THRESHOLD = 0.5;

/** Hue offsets used to derive the companion colours when a theme supplies only an accent. */
export const COMPANION_HUE_OFFSET = -18;
export const TERTIARY_HUE_OFFSET = 18;

/** Minimum contrast ratio body text must keep against the page background. */
export const MIN_TEXT_CONTRAST = 7;
/** Minimum contrast ratio accent-coloured text must keep against the page background. */
export const MIN_ACCENT_CONTRAST = 4.5;
/** Minimum contrast the accent roles keep against the page, so buttons stay visible. */
export const MIN_ACCENT_ROLE_CONTRAST = 3.5;
/** Minimum contrast for secondary text such as captions and labels. */
export const MIN_MUTED_CONTRAST = 4.5;
/** How far secondary text is faded towards the page before contrast is enforced. */
export const MUTED_TEXT_WEIGHT = 0.55;
/** Contrast each group colour keeps against the label drawn on it. */
export const MIN_SERIES_CONTRAST = 4.5;

export const COLOR_STEPS = [
    50, 100, 150, 200, 250, 300, 350, 400, 450, 500, 550, 600, 650, 700, 750, 800, 850, 900, 950,
];

/** Course groups that carry a colour of their own, and the colours the app has always used. */
export const SERIES_NAMES = [
    '1st year', '2nd year', '3rd year', '4th year', '5th year', '6th year', 'NLE1', 'NLE2',
];

export const DEFAULT_SERIES_COLORS = [
    '#00BCD4', '#FF9800', '#795548', '#9C27B0', '#4CAF50', '#E91E63', '#607D8B', '#FDD835',
];

export const DEFAULT_SERIES_FALLBACK = '#808080';
export const DEFAULT_SERIES_LABEL = '#ffffff';
export const SERIES_COUNT = SERIES_NAMES.length;

/**
 * A custom theme colours the course groups in shades of its own colour: the lightness runs
 * across this range while the hue drifts slightly, so the groups stay apart without
 * introducing colours the theme never asked for.
 */
export const SERIES_LIGHTNESS_RANGE: Record<ColorScheme, {from: number, to: number}> = {
    light: {from: 0.74, to: 0.26},
    dark: {from: 0.68, to: 0.3},
};
export const SERIES_SATURATION: Record<ColorScheme, number> = {light: 0.55, dark: 0.5};
export const SERIES_HUE_DRIFT = 14;

/** How far the informational tag is blended into the page behind it. */
export const TAG_SURFACE_WEIGHT = 0.12;

export const HEATMAP_LEVEL_WEIGHTS = [0.28, 0.5, 0.74, 1];
export const HEATMAP_EMPTY_WEIGHT = 0.08;
/** Contrast the heatmap's strongest level keeps against the page, so it stays visible. */
export const MIN_HEATMAP_CONTRAST = 2.5;

export const THEME_MODES: ThemeModeOption[] = [
    {value: 'light', label: 'Light', description: 'Always light.', icon: 'sunny-outline'},
    {value: 'dark', label: 'Dark', description: 'Always dark.', icon: 'moon-outline'},
    {value: 'system', label: 'System', description: 'Follow your device.', icon: 'phone-portrait-outline'},
    {value: 'custom', label: 'Custom', description: 'Your own colours.', icon: 'color-palette-outline'},
];

export const DEFAULT_MODE = THEME_MODES[2].value;

/** The modes that are not a custom theme, offered inside the editor as the way back out. */
export const STANDARD_MODES = THEME_MODES.filter(option => option.value !== 'custom');

/** A custom theme always renders light, so a chosen colour shows as itself. */
export const CUSTOM_SCHEME: ColorScheme = 'light';

/** Brand colours taken from the faculty's own sites. */
export const FACULTY_ACCENT = '#1f6241';
export const UNIVERSITY_ACCENT = '#e91e90';
/** The pages the brand colours are drawn on. */
export const UNIVERSITY_PAGE = '#fdf0f5';
export const FACULTY_PAGE = '#f2f6f4';

/**
 * Ready-made colour templates. Each names the page it is drawn on and the colour everything
 * else is drawn in, so a pairing can be offered either way round.
 */
export const THEME_TEMPLATES: ThemeTemplate[] = [
    {
        id: 'university',
        name: 'Pink',
        description: 'Pink page with pink buttons.',
        seed: {accent: UNIVERSITY_ACCENT, companion: null, tertiary: null, surfaceTint: null, intensity: 1},
        background: UNIVERSITY_PAGE,
    },
    {
        id: 'faculty',
        name: 'Green',
        description: 'Green page with green buttons.',
        seed: {accent: FACULTY_ACCENT, companion: null, tertiary: null, surfaceTint: null, intensity: 1},
        background: FACULTY_PAGE,
    },
    {
        id: 'university-faculty',
        name: 'Pink & Green',
        description: 'Pink page with green buttons.',
        seed: {
            accent: FACULTY_ACCENT,
            companion: null,
            tertiary: null,
            surfaceTint: UNIVERSITY_ACCENT,
            intensity: 1,
        },
        background: UNIVERSITY_PAGE,
    },
    {
        id: 'faculty-university',
        name: 'Green & Pink',
        description: 'Green page with pink buttons.',
        seed: {
            accent: UNIVERSITY_ACCENT,
            companion: null,
            tertiary: null,
            surfaceTint: FACULTY_ACCENT,
            intensity: 1,
        },
        background: FACULTY_PAGE,
    },
];

/** Used when the colour comes from the picker rather than a template. */
export const OWN_COLOR_TEMPLATE_ID = 'own';
export const DEFAULT_TEMPLATE_ID = THEME_TEMPLATES[0].id;

/**
 * Curated accents for the picker. The brand colours are left out because the templates
 * already offer them, which keeps the row to a single line.
 */
export const ACCENT_SWATCHES: string[] = [
    '#3880ff', '#0f766e', '#7c3aed', '#b45309',
    '#be123c', '#0369a1', '#4d7c0f', '#475569',
];

/** A colour picked in the editor tints the page as fully as a template does. */
export const OWN_COLOR_INTENSITY = 1;

export const BACKGROUND_FIT_OPTIONS: BackgroundFitOption[] = [
    {value: 'cover', label: 'Fill'},
    {value: 'contain', label: 'Fit'},
    {value: 'tile', label: 'Tile'},
];

export const DEFAULT_BACKGROUND: ThemeBackground = {
    color: null,
    imageId: null,
    imageOpacity: 0.35,
    imageBlur: 2,
    imageFit: 'cover',
};

/** The seed the standard modes use: no accent, so the base palette renders untouched. */
export const NEUTRAL_SEED = {
    accent: null,
    companion: null,
    tertiary: null,
    surfaceTint: null,
    intensity: 0,
};

export function defaultCustomTheme(): CustomTheme {
    const template = THEME_TEMPLATES[0];
    return {
        templateId: template.id,
        seed: {...template.seed},
        background: {...DEFAULT_BACKGROUND, color: template.background},
    };
}

export function defaultThemeSettings(): ThemeSettings {
    return {
        mode: DEFAULT_MODE,
        custom: defaultCustomTheme(),
        updatedAt: 0,
    };
}

export function findTemplate(id: string): ThemeTemplate | undefined {
    return THEME_TEMPLATES.find(template => template.id === id);
}

export function seriesIndexOf(name: string): number {
    return SERIES_NAMES.indexOf(name);
}
