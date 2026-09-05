import {
    adjustLightnessToContrast,
    contrastRatio,
    ensureContrast,
    hslToRgb,
    mix,
    parseColor,
    readableOn,
    rgbToHsl,
    relativeLuminance,
    Rgb,
    rotateHue,
    shade,
    tint,
    toHex,
    toRgbString,
    BLACK,
    WHITE,
} from './color';
import {
    ACCENT_ROLES,
    DEFAULT_SERIES_COLORS,
    DEFAULT_SERIES_FALLBACK,
    DEFAULT_SERIES_LABEL,
    SERIES_COUNT,
    SERIES_HUE_DRIFT,
    SERIES_LIGHTNESS_RANGE,
    SERIES_SATURATION,
    TAG_SURFACE_WEIGHT,
    ACCENT_WEIGHTS,
    BASE_SCHEMES,
    COLOR_STEPS,
    COMPANION_HUE_OFFSET,
    CONTRAST_LUMINANCE_THRESHOLD,
    HEATMAP_EMPTY_WEIGHT,
    HEATMAP_LEVEL_WEIGHTS,
    MIN_ACCENT_CONTRAST,
    MIN_ACCENT_ROLE_CONTRAST,
    MIN_HEATMAP_CONTRAST,
    MIN_MUTED_CONTRAST,
    MUTED_TEXT_WEIGHT,
    MIN_TEXT_CONTRAST,
    ROLE_WEIGHTS,
    SHADE_AMOUNT,
    SURFACE_STEPS,
    TERTIARY_HUE_OFFSET,
    TINT_AMOUNT,
} from './theme-presets';
import {BaseScheme, ColorScheme, SEMANTIC_ROLES, SemanticRole, ThemeBackground, ThemeSeed} from './theme.model';

export type CssVariables = Record<string, string>;

function clamp01(value: number): number {
    return Math.min(1, Math.max(0, value));
}

/** Ionic picks black or white for text on a colour by how light that colour is. */
function contrastFor(color: Rgb): Rgb {
    return relativeLuminance(color) > CONTRAST_LUMINANCE_THRESHOLD ? BLACK : WHITE;
}

function assignRole(variables: CssVariables, role: SemanticRole, color: Rgb): void {
    const contrast = contrastFor(color);
    variables[`--ion-color-${role}`] = toHex(color);
    variables[`--ion-color-${role}-rgb`] = toRgbString(color);
    variables[`--ion-color-${role}-contrast`] = toHex(contrast);
    variables[`--ion-color-${role}-contrast-rgb`] = toRgbString(contrast);
    variables[`--ion-color-${role}-shade`] = toHex(shade(color, SHADE_AMOUNT));
    variables[`--ion-color-${role}-tint`] = toHex(tint(color, TINT_AMOUNT));
}

interface AccentRoles {
    accent: Rgb;
    companion: Rgb;
    tertiary: Rgb;
    surfaceTint: Rgb;
    /** True when the colours come from the theme seed rather than the untouched base palette. */
    derived: boolean;
}

function seedColor(value: string | null): Rgb | null {
    return value ? parseColor(value) : null;
}

/**
 * A seed without an accent keeps the scheme's own roles, which is what makes the
 * untouched theme render exactly as the base palette in both light and dark.
 */
function resolveAccents(seed: ThemeSeed, base: BaseScheme): AccentRoles {
    const chosen = seedColor(seed.accent);
    const accent = chosen ?? parseColor(base.roles.primary) ?? BLACK;
    const companion = seedColor(seed.companion)
        ?? (chosen ? rotateHue(accent, COMPANION_HUE_OFFSET) : parseColor(base.roles.secondary) ?? accent);
    const tertiary = seedColor(seed.tertiary)
        ?? (chosen
            ? rotateHue(seedColor(seed.companion) ?? accent, TERTIARY_HUE_OFFSET)
            : parseColor(base.roles.tertiary) ?? accent);
    const surfaceTint = seedColor(seed.surfaceTint) ?? accent;
    return {accent, companion, tertiary, surfaceTint, derived: chosen !== null};
}

/**
 * Turn a theme seed into the full set of CSS custom properties the app renders with.
 *
 * Every colour beyond the seed is derived here, so features never name a colour of their own
 * and any accent — including one the user picked — produces a complete, legible palette.
 */
export function buildThemeVariables(
    seed: ThemeSeed,
    scheme: ColorScheme,
    background: ThemeBackground,
): CssVariables {
    const base = BASE_SCHEMES[scheme];
    const baseBackground = parseColor(base.background) ?? WHITE;
    const baseText = parseColor(base.text) ?? BLACK;
    const intensity = clamp01(seed.intensity);
    const {accent, companion, tertiary, surfaceTint, derived} = resolveAccents(seed, base);

    const chosenBackground = background.color ? parseColor(background.color) : null;
    const pageBackground = chosenBackground ?? mix(surfaceTint, baseBackground, ACCENT_WEIGHTS.background * intensity);
    // A hand-picked background may be far lighter or darker than the scheme's own, so the text
    // starts from whichever of black or white reads on it rather than from the scheme's colour.
    const textAnchor = chosenBackground ? readableOn(chosenBackground) : baseText;
    const tintedText = mix(surfaceTint, textAnchor, ACCENT_WEIGHTS.text * intensity);
    const pageText = ensureContrast(tintedText, pageBackground, MIN_TEXT_CONTRAST);

    const variables: CssVariables = {};

    const visible = (color: Rgb) =>
        derived ? adjustLightnessToContrast(color, pageBackground, MIN_ACCENT_ROLE_CONTRAST) : color;
    const roleColors: Record<SemanticRole, Rgb> = {} as Record<SemanticRole, Rgb>;
    roleColors.primary = visible(accent);
    roleColors.secondary = visible(companion);
    roleColors.tertiary = visible(tertiary);
    for (const role of SEMANTIC_ROLES) {
        if (ACCENT_ROLES.includes(role)) {
            continue;
        }
        const baseRole = parseColor(base.roles[role]) ?? pageText;
        roleColors[role] = mix(surfaceTint, baseRole, ROLE_WEIGHTS[role] * intensity);
    }
    variables['--ion-background-color'] = toHex(pageBackground);
    variables['--ion-background-color-rgb'] = toRgbString(pageBackground);
    variables['--ion-text-color'] = toHex(pageText);
    variables['--ion-text-color-rgb'] = toRgbString(pageText);

    for (const step of COLOR_STEPS) {
        variables[`--ion-color-step-${step}`] = toHex(mix(pageText, pageBackground, step / 1000));
    }

    // Surfaces follow the page background rather than the requested scheme, so a hand-picked
    // background of any lightness still separates cards, items and toolbars from the page.
    const surfaceScheme: ColorScheme = relativeLuminance(pageBackground) > CONTRAST_LUMINANCE_THRESHOLD
        ? 'light'
        : 'dark';
    const steps = SURFACE_STEPS[surfaceScheme];
    const surfaceOver = (step: number, weight: number) =>
        mix(surfaceTint, mix(pageText, pageBackground, step), weight * intensity);

    const item = surfaceOver(steps.item, ACCENT_WEIGHTS.item);
    const card = surfaceOver(steps.card, ACCENT_WEIGHTS.card);
    const toolbar = surfaceOver(steps.toolbar, ACCENT_WEIGHTS.toolbar);
    const border = mix(pageText, pageBackground, COLOR_STEPS[2] / 1000);

    variables['--ion-item-background'] = toHex(item);
    variables['--ion-item-background-activated'] = toHex(mix(surfaceTint, item, ACCENT_WEIGHTS.toolbar));
    variables['--ion-card-background'] = toHex(card);
    variables['--ion-toolbar-background'] = toHex(toolbar);
    variables['--ion-toolbar-color'] = toHex(pageText);
    variables['--ion-border-color'] = toHex(border);

    // Every surface text can land on, including the light role, which some pages use as a page.
    const surfaces = [
        pageBackground, card, item, toolbar,
        roleColors.light,
        mix(pageText, pageBackground, HEATMAP_EMPTY_WEIGHT),
    ];
    const readableOnSurfaces = (color: Rgb, minRatio: number) =>
        surfaces.reduce((result, surface) => adjustLightnessToContrast(result, surface, minRatio), color);

    // Secondary text is held to a contrast target, but a chosen accent is left as chosen:
    // a theme built from a brand colour has to render that colour, not an adjusted version.
    if (derived) {
        roleColors.medium = readableOnSurfaces(roleColors.medium, MIN_MUTED_CONTRAST);
    }
    for (const role of SEMANTIC_ROLES) {
        assignRole(variables, role, roleColors[role]);
    }
    const accentText = readableOnSurfaces(accent, MIN_ACCENT_CONTRAST);
    const companionText = readableOnSurfaces(companion, MIN_ACCENT_CONTRAST);
    variables['--flick-accent'] = toHex(roleColors.primary);
    variables['--flick-accent-rgb'] = toRgbString(roleColors.primary);
    variables['--flick-accent-text'] = toHex(accentText);
    variables['--flick-companion-text'] = toHex(companionText);
    // Secondary text has to stay readable on every surface it can land on, not just the page.
    variables['--flick-muted-text'] = toHex(
        readableOnSurfaces(mix(pageText, pageBackground, MUTED_TEXT_WEIGHT), MIN_MUTED_CONTRAST));
    variables['--flick-surface'] = toHex(card);
    variables['--flick-surface-muted'] = toHex(surfaces[surfaces.length - 1]);

    const tagColor = readableOnSurfaces(roleColors.success, MIN_ACCENT_CONTRAST);
    variables['--flick-tag-color'] = toHex(tagColor);
    variables['--flick-tag-background'] = toHex(mix(tagColor, pageBackground, TAG_SURFACE_WEIGHT));
    variables['--flick-warning-text'] = toHex(readableOnSurfaces(roleColors.warning, MIN_ACCENT_CONTRAST));

    // The standard modes keep the group colours the app has always used. A custom theme
    // colours the groups in shades of its own colour, each with a label that reads on it.
    if (derived) {
        const {h, s: saturation} = rgbToHsl(roleColors.primary);
        const range = SERIES_LIGHTNESS_RANGE[scheme];
        const seriesColor = (position: number) => hslToRgb({
            h: h + (position - 0.5) * 2 * SERIES_HUE_DRIFT,
            s: Math.max(saturation, SERIES_SATURATION[scheme]),
            l: range.from + (range.to - range.from) * position,
        });
        for (let index = 0; index < SERIES_COUNT; index++) {
            const color = seriesColor(index / Math.max(1, SERIES_COUNT - 1));
            variables[`--flick-series-${index}`] = toHex(color);
            // Whichever of black or white actually reads best: a mid-tone shade needs black,
            // where Ionic's lightness rule would still hand it white.
            variables[`--flick-series-${index}-contrast`] = toHex(readableOn(color));
        }
        const fallback = mix(roleColors.medium, pageBackground, 0.85);
        variables['--flick-series-fallback'] = toHex(fallback);
        variables['--flick-series-fallback-contrast'] = toHex(readableOn(fallback));
    } else {
        DEFAULT_SERIES_COLORS.forEach((color, index) => {
            variables[`--flick-series-${index}`] = color;
            variables[`--flick-series-${index}-contrast`] = DEFAULT_SERIES_LABEL;
        });
        variables['--flick-series-fallback'] = DEFAULT_SERIES_FALLBACK;
        variables['--flick-series-fallback-contrast'] = DEFAULT_SERIES_LABEL;
    }

    const heatAccent = adjustLightnessToContrast(roleColors.primary, pageBackground, MIN_HEATMAP_CONTRAST);
    variables['--flick-heat-0'] = toHex(mix(pageText, pageBackground, HEATMAP_EMPTY_WEIGHT));
    HEATMAP_LEVEL_WEIGHTS.forEach((weight, index) => {
        variables[`--flick-heat-${index + 1}`] = toHex(mix(heatAccent, pageBackground, weight));
    });

    const opacity = clamp01(background.imageOpacity);
    variables['--flick-background-scrim'] = `rgba(${toRgbString(pageBackground)}, ${(1 - opacity).toFixed(3)})`;
    variables['--flick-background-blur'] = `${Math.max(0, background.imageBlur)}px`;
    variables['--flick-background-size'] = background.imageFit === 'tile' ? 'auto' : background.imageFit;
    variables['--flick-background-repeat'] = background.imageFit === 'tile' ? 'repeat' : 'no-repeat';

    return variables;
}

/** Contrast of body text against the page background, used to verify a generated palette. */
export function paletteTextContrast(variables: CssVariables): number {
    const background = parseColor(variables['--ion-background-color']);
    const text = parseColor(variables['--ion-text-color']);
    return background && text ? contrastRatio(background, text) : 0;
}
