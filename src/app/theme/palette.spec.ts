import {contrastRatio, parseColor, rgbToHsl} from './color';
import {buildThemeVariables} from './palette';
import {
    BASE_SCHEMES,
    DEFAULT_BACKGROUND,
    DEFAULT_SERIES_COLORS,
    MIN_MUTED_CONTRAST,
    MIN_SERIES_CONTRAST,
    MIN_TEXT_CONTRAST,
    NEUTRAL_SEED,
    SERIES_COUNT,
    SERIES_HUE_DRIFT,
    THEME_TEMPLATES,
} from './theme-presets';
import {ColorScheme, SEMANTIC_ROLES, ThemeSeed} from './theme.model';

const SCHEMES: ColorScheme[] = ['light', 'dark'];

function ratio(first: string, second: string): number {
    return contrastRatio(parseColor(first), parseColor(second));
}

function build(seed: ThemeSeed, scheme: ColorScheme, background = DEFAULT_BACKGROUND) {
    return buildThemeVariables(seed, scheme, background);
}

describe('buildThemeVariables', () => {
    it('should leave the base palette untouched for the standard modes', () => {
        for (const scheme of SCHEMES) {
            const variables = build(NEUTRAL_SEED, scheme);
            const base = BASE_SCHEMES[scheme];
            expect(variables['--ion-background-color']).toBe(base.background);
            expect(variables['--ion-text-color']).toBe(base.text);
            for (const role of SEMANTIC_ROLES) {
                expect(variables[`--ion-color-${role}`]).toBe(base.roles[role]);
            }
        }
    });

    it('should keep the course colours the app has always used outside a custom theme', () => {
        for (const scheme of SCHEMES) {
            const variables = build(NEUTRAL_SEED, scheme);
            DEFAULT_SERIES_COLORS.forEach((color, index) => {
                expect(variables[`--flick-series-${index}`]).toBe(color);
            });
        }
    });

    it('should derive Ionic shade, tint and contrast the same way Ionic does', () => {
        const variables = build(NEUTRAL_SEED, 'light');
        expect(variables['--ion-color-primary-shade']).toBe('#3171e0');
        expect(variables['--ion-color-primary-tint']).toBe('#4c8dff');
        expect(variables['--ion-color-primary-contrast']).toBe('#ffffff');
        expect(variables['--ion-color-warning-contrast']).toBe('#000000');
    });

    it('should keep body text readable in every template and mode', () => {
        for (const template of THEME_TEMPLATES) {
            for (const scheme of SCHEMES) {
                const variables = build(template.seed, scheme);
                expect(ratio(variables['--ion-text-color'], variables['--ion-background-color']))
                    .toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
            }
        }
    });

    it('should keep secondary text readable on every surface', () => {
        const surfaces = [
            '--ion-background-color', '--ion-card-background',
            '--ion-item-background', '--ion-toolbar-background', '--flick-surface-muted',
        ];
        for (const template of THEME_TEMPLATES) {
            for (const scheme of SCHEMES) {
                const variables = build(template.seed, scheme);
                for (const surface of surfaces) {
                    expect(ratio(variables['--flick-muted-text'], variables[surface]))
                        .toBeGreaterThanOrEqual(MIN_MUTED_CONTRAST - 0.01);
                }
            }
        }
    });

    it('should label every generated course colour legibly', () => {
        for (const template of THEME_TEMPLATES) {
            for (const scheme of SCHEMES) {
                const variables = build(template.seed, scheme);
                for (const key of [...Array(SERIES_COUNT).keys()].map(String).concat('fallback')) {
                    expect(ratio(variables[`--flick-series-${key}`], variables[`--flick-series-${key}-contrast`]))
                        .toBeGreaterThanOrEqual(MIN_SERIES_CONTRAST);
                }
            }
        }
    });

    it('should keep the course colours of a custom theme in shades of its own colour', () => {
        const variables = build(THEME_TEMPLATES[0].seed, 'light');
        const hues = [...Array(SERIES_COUNT).keys()]
            .map(index => rgbToHsl(parseColor(variables[`--flick-series-${index}`])).h);
        const accentHue = rgbToHsl(parseColor(variables['--ion-color-primary'])).h;
        for (const hue of hues) {
            const distance = Math.min(Math.abs(hue - accentHue), 360 - Math.abs(hue - accentHue));
            expect(distance).toBeLessThanOrEqual(SERIES_HUE_DRIFT + 1);
        }
    });

    it('should stay readable when a background colour fights the chosen mode', () => {
        const seed: ThemeSeed = {accent: '#e91e90', companion: null, tertiary: null, surfaceTint: null, intensity: 1};
        const variables = build(seed, 'light', {...DEFAULT_BACKGROUND, color: '#101820'});
        expect(variables['--ion-background-color']).toBe('#101820');
        expect(ratio(variables['--ion-text-color'], '#101820')).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
        expect(variables['--ion-card-background']).not.toBe('#ffffff');
        expect(ratio(variables['--ion-text-color'], variables['--ion-card-background']))
            .toBeGreaterThanOrEqual(MIN_MUTED_CONTRAST);
    });

    it('should give the heatmap a ramp that ends at the accent', () => {
        const variables = build(THEME_TEMPLATES[0].seed, 'light');
        const levels = [0, 1, 2, 3, 4].map(level => variables[`--flick-heat-${level}`]);
        expect(new Set(levels).size).toBe(levels.length);
        expect(levels[4]).toBe(variables['--flick-accent']);
    });
});
