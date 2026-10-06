/** What the appearance menu offers: the three standard modes plus a colour theme of your own. */
export type ThemeMode = 'light' | 'dark' | 'system' | 'custom';
export type ColorScheme = 'light' | 'dark';
export type SchemePreference = ColorScheme | 'system';
export type BackgroundFit = 'cover' | 'contain';
/** No picture, one chosen picture, or every stored picture in turn. */
export type BackgroundPictureMode = 'none' | 'single' | 'slideshow';

/**
 * How a chosen colour is drawn. Every colour belongs to one of these by how light it is, and
 * in the shade it belongs to it is drawn exactly as picked. The other two adapt it: 'light'
 * tints a light page with it, 'dark' fills a dark page with it, and 'fill' always gives the
 * page over to the colour itself.
 */
export type ThemeShade = 'light' | 'dark' | 'fill';

export const SEMANTIC_ROLES = [
    'primary', 'secondary', 'tertiary', 'success', 'warning', 'danger', 'dark', 'medium', 'light',
] as const;

export type SemanticRole = typeof SEMANTIC_ROLES[number];

/**
 * The few values a colour theme is described by. Everything else in the palette is derived,
 * so a theme never has to enumerate colours for individual features.
 */
export interface ThemeSeed {
    /** Main colour. When null the scheme's own neutral palette is used unchanged. */
    accent: string | null;
    /** Second colour; derived from the accent's hue when null. */
    companion: string | null;
    /** Third colour; derived from the companion's hue when null. */
    tertiary: string | null;
    /** Colour blended into backgrounds and surfaces; falls back to the accent. */
    surfaceTint: string | null;
    /** How strongly the surface tint colours the page. 0 keeps the neutral base palette. */
    intensity: number;
}

export interface ThemeBackground {
    color: string | null;
    /** The picture shown in 'single' mode, kept while another mode is chosen. */
    imageId: string | null;
    imageOpacity: number;
    imageBlur: number;
    imageFit: BackgroundFit;
    pictureMode: BackgroundPictureMode;
    slideshowMinutes: number;
    slideshowShuffle: boolean;
    /** When the slideshow's timing was last started, so it carries on across reloads. */
    slideshowSince: number;
}

/**
 * Everything the custom mode remembers. The standard modes deliberately carry none of it.
 */
export interface CustomTheme {
    templateId: string;
    seed: ThemeSeed;
    background: ThemeBackground;
    /** How the chosen colours are drawn: light, dark, or the colour exactly as picked. */
    shade: ThemeShade;
}

export interface ThemeSettings {
    mode: ThemeMode;
    custom: CustomTheme;
    updatedAt: number;
}

/**
 * Exact custom properties a theme states for itself. Anything left out stays derived, so a
 * theme can pin as much or as little of the palette as it needs.
 */
export type ThemeVariables = Record<string, string>;

/** The rows the ready-made templates are listed in: the brand pairings, then single colours. */
export type ThemeTemplateGroup = 'brand' | 'colour';

export interface ThemeTemplateGroupOption {
    value: ThemeTemplateGroup;
    label: string;
}

export interface ThemeTemplate {
    id: string;
    name: string;
    description: string;
    group: ThemeTemplateGroup;
    seed: ThemeSeed;
    /** Page colour the template starts from; null lets it be derived from the accent. */
    background: string | null;
    /**
     * Colours this template states rather than has derived, applied over the generated
     * palette. They hold only while the template's own colours are still in place; adjusting
     * the theme leaves them behind and the palette is derived from what was chosen instead.
     */
    variables?: ThemeVariables;
}

export interface ThemeModeOption {
    value: ThemeMode;
    label: string;
    description: string;
    icon: string;
}

export interface BackgroundFitOption {
    value: BackgroundFit;
    label: string;
}

export interface BackgroundPictureModeOption {
    value: BackgroundPictureMode;
    label: string;
}

export interface SlideshowIntervalOption {
    minutes: number;
    label: string;
}

export interface ThemeShadeOption {
    value: ThemeShade;
    label: string;
    icon: string;
}

/** The three colours the editor lets the reader set, each with one job. */
export type ColorRole = 'primary' | 'secondary' | 'background';

export interface ColorRoleOption {
    value: ColorRole;
    label: string;
    hint: string;
}

/** Neutral palette each theme starts from; the accent is blended into it by intensity. */
export interface BaseScheme {
    background: string;
    text: string;
    roles: Record<SemanticRole, string>;
}

/** How far each surface sits from the page background, towards the text colour. */
export interface SurfaceSteps {
    card: number;
    item: number;
    toolbar: number;
}
