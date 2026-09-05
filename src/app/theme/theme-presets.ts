import {
    BackgroundFitOption,
    ThemeShade,
    ThemeShadeOption,
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

/**
 * A page drawn in the theme colour itself leaves the surfaces nothing to blend towards, so
 * the scheme's own steps would lay cards, items and the toolbar flat against it. These place
 * them by stepping towards the text colour instead, which separates them on any page.
 */
export const FILLED_SURFACE_STEPS: SurfaceSteps = {card: 0.07, item: 0.05, toolbar: 0.13};

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
 * introducing colours the theme never asked for. The range stays clear of the very light
 * end so a single label colour reads on every group.
 */
export const SERIES_LIGHTNESS_RANGE: Record<ColorScheme, {from: number, to: number}> = {
    light: {from: 0.52, to: 0.3},
    dark: {from: 0.56, to: 0.34},
};

/**
 * The groups are held to a softer saturation than the accent itself, so a vivid theme
 * colour still renders the groups as muted shades rather than as eight vibrant blocks.
 * The floor keeps a nearly grey accent from producing eight indistinguishable greys.
 */
export const SERIES_SATURATION: Record<ColorScheme, {min: number, max: number}> = {
    light: {min: 0.35, max: 0.5},
    dark: {min: 0.32, max: 0.46},
};
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

export const DEFAULT_CUSTOM_SHADE: ThemeShade = 'light';

export const THEME_SHADES: ThemeShadeOption[] = [
    {value: 'light', label: 'Light', icon: 'sunny-outline'},
    {value: 'dark', label: 'Dark', icon: 'moon-outline'},
    {value: 'fill', label: 'Fill', icon: 'color-fill-outline'},
];

/**
 * Which shade a colour belongs to. A colour light enough to carry black body text at the
 * contrast body text is held to belongs to 'light'; one dark enough to carry white text
 * belongs to 'dark'; anything between can carry neither and belongs to 'fill'. Both follow
 * from MIN_TEXT_CONTRAST, so a colour is only ever drawn as picked where it stays readable.
 */
export const LIGHT_PAGE_MIN_LUMINANCE = MIN_TEXT_CONTRAST * 0.05 - 0.05;
export const DARK_PAGE_MAX_LUMINANCE = 1.05 / MIN_TEXT_CONTRAST - 0.05;

/**
 * Drawn dark, a custom theme fills the page with the colour itself rather than tinting a
 * near-black page, so the page reads as that colour. The lightness is kept low enough that
 * body text still clears its contrast rule, and the saturation is banded so a nearly grey
 * colour still gives a grey page rather than a colourful one.
 */
export const DARK_PAGE_LIGHTNESS = 0.2;
export const DARK_PAGE_SATURATION = {min: 0.2, max: 0.55};

/** Brand colours taken from the faculty's own sites. */
export const FACULTY_ACCENT = '#1f6241';
export const UNIVERSITY_ACCENT = '#e91e90';
/** The pages the brand colours are drawn on. */
export const UNIVERSITY_PAGE = '#fff0f5';
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
        variables: {
        '--ion-color-primary': '#E91E90',
        '--ion-color-primary-rgb': '233, 30, 144',
        '--ion-color-primary-contrast': '#ffffff',
        '--ion-color-primary-contrast-rgb': '255, 255, 255',
        '--ion-color-primary-shade': '#CD1A7F',
        '--ion-color-primary-tint': '#EB359C',
        '--ion-color-secondary': '#F06292',
        '--ion-color-secondary-rgb': '240, 98, 146',
        '--ion-color-secondary-contrast': '#ffffff',
        '--ion-color-secondary-contrast-rgb': '255, 255, 255',
        '--ion-color-secondary-shade': '#D35680',
        '--ion-color-secondary-tint': '#F2729D',
        '--ion-color-tertiary': '#AD1457',
        '--ion-color-tertiary-rgb': '173, 20, 87',
        '--ion-color-tertiary-contrast': '#ffffff',
        '--ion-color-tertiary-contrast-rgb': '255, 255, 255',
        '--ion-color-tertiary-shade': '#98124D',
        '--ion-color-tertiary-tint': '#B52C68',
        '--ion-color-success': '#E91E63',
        '--ion-color-success-rgb': '233, 30, 99',
        '--ion-color-success-contrast': '#ffffff',
        '--ion-color-success-contrast-rgb': '255, 255, 255',
        '--ion-color-success-shade': '#CD1A57',
        '--ion-color-success-tint': '#EB3573',
        '--ion-color-warning': '#FF8A80',
        '--ion-color-warning-rgb': '255, 138, 128',
        '--ion-color-warning-contrast': '#000000',
        '--ion-color-warning-contrast-rgb': '0, 0, 0',
        '--ion-color-warning-shade': '#E07970',
        '--ion-color-warning-tint': '#FF968D',
        '--ion-color-danger': '#C2185B',
        '--ion-color-danger-rgb': '194, 24, 91',
        '--ion-color-danger-contrast': '#ffffff',
        '--ion-color-danger-contrast-rgb': '255, 255, 255',
        '--ion-color-danger-shade': '#AB1550',
        '--ion-color-danger-tint': '#C82F6B',
        '--ion-color-dark': '#4A0E2B',
        '--ion-color-dark-rgb': '74, 14, 43',
        '--ion-color-dark-contrast': '#ffffff',
        '--ion-color-dark-contrast-rgb': '255, 255, 255',
        '--ion-color-dark-shade': '#410C26',
        '--ion-color-dark-tint': '#5C2640',
        '--ion-color-medium': '#B07090',
        '--ion-color-medium-rgb': '176, 112, 144',
        '--ion-color-medium-contrast': '#ffffff',
        '--ion-color-medium-contrast-rgb': '255, 255, 255',
        '--ion-color-medium-shade': '#9B637F',
        '--ion-color-medium-tint': '#B87E9B',
        '--ion-color-light': '#FFF0F5',
        '--ion-color-light-rgb': '255, 240, 245',
        '--ion-color-light-contrast': '#4A0E2B',
        '--ion-color-light-contrast-rgb': '74, 14, 43',
        '--ion-color-light-shade': '#E0D3D8',
        '--ion-color-light-tint': '#FFF2F6',
        '--ion-background-color': '#FFF0F5',
        '--ion-background-color-rgb': '255, 240, 245',
        '--ion-text-color': '#4A0E2B',
        '--ion-text-color-rgb': '74, 14, 43',
        '--ion-toolbar-background': '#F8BBD0',
        '--ion-toolbar-color': '#4A0E2B',
        '--ion-item-background': '#FCE4EC',
        '--ion-item-background-activated': '#F8BBD0',
        '--ion-border-color': '#F48FB1',
        '--ion-color-step-50': '#FCE4EC',
        '--ion-color-step-100': '#F8BBD0',
        '--ion-color-step-150': '#F48FB1',
        '--ion-color-step-200': '#F06292',
        '--ion-color-step-250': '#EC407A',
        '--ion-color-step-300': '#E91E63',
        '--ion-color-step-350': '#D81B60',
        '--ion-color-step-400': '#C2185B',
        '--ion-color-step-450': '#AD1457',
        '--ion-color-step-500': '#880E4F',
        '--ion-color-step-550': '#7B0C47',
        '--ion-color-step-600': '#6E0A3F',
        '--ion-color-step-650': '#610937',
        '--ion-color-step-700': '#54072F',
        '--ion-color-step-750': '#470627',
        '--ion-color-step-800': '#3A041F',
        '--ion-color-step-850': '#2D0317',
        '--ion-color-step-900': '#20020F',
        '--ion-color-step-950': '#130107',
        '--ion-card-background': '#FCE4EC',
        '--flick-series-0': '#F48FB1',
        '--flick-series-0-contrast': '#ffffff',
        '--flick-series-1': '#E91E90',
        '--flick-series-1-contrast': '#ffffff',
        '--flick-series-2': '#AD1457',
        '--flick-series-2-contrast': '#ffffff',
        '--flick-series-3': '#C2185B',
        '--flick-series-3-contrast': '#ffffff',
        '--flick-series-4': '#D81B60',
        '--flick-series-4-contrast': '#ffffff',
        '--flick-series-5': '#880E4F',
        '--flick-series-5-contrast': '#ffffff',
        '--flick-series-6': '#EC407A',
        '--flick-series-6-contrast': '#ffffff',
        '--flick-series-7': '#F06292',
        '--flick-series-7-contrast': '#ffffff',
        '--flick-series-fallback': '#B07090',
        '--flick-series-fallback-contrast': '#ffffff',
        '--flick-accent': '#E91E90',
        '--flick-accent-rgb': '233, 30, 144',
        '--flick-accent-text': '#E91E90',
        '--flick-companion-text': '#AD1457',
        '--flick-muted-text': '#C48BA0',
        '--flick-warning-text': '#E91E90',
        '--flick-surface': '#FCE4EC',
        '--flick-surface-muted': '#F8BBD0',
        '--flick-tag-color': '#E91E90',
        '--flick-tag-background': '#FCE4EC',
        },
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

export const MAX_SAVED_COLORS = 12;
export const MAX_REMEMBERED_SHADES = 60;

export const BACKGROUND_FIT_OPTIONS: BackgroundFitOption[] = [
    {value: 'cover', label: 'Fill'},
    {value: 'contain', label: 'Fit'},
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
        shade: DEFAULT_CUSTOM_SHADE,
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
