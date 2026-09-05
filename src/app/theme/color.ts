export interface Rgb {
    r: number;
    g: number;
    b: number;
}

export interface Hsl {
    h: number;
    s: number;
    l: number;
}

const HEX_SHORT = /^#?([\da-f])([\da-f])([\da-f])$/i;
const HEX_FULL = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i;

export const WHITE: Rgb = {r: 255, g: 255, b: 255};
export const BLACK: Rgb = {r: 0, g: 0, b: 0};

export function parseColor(value: string): Rgb | null {
    if (!value) {
        return null;
    }
    const short = HEX_SHORT.exec(value.trim());
    if (short) {
        return {
            r: parseInt(short[1] + short[1], 16),
            g: parseInt(short[2] + short[2], 16),
            b: parseInt(short[3] + short[3], 16),
        };
    }
    const full = HEX_FULL.exec(value.trim());
    if (full) {
        return {r: parseInt(full[1], 16), g: parseInt(full[2], 16), b: parseInt(full[3], 16)};
    }
    return null;
}

export function isValidColor(value: string): boolean {
    return parseColor(value) !== null;
}

function clampChannel(value: number): number {
    return Math.min(255, Math.max(0, Math.round(value)));
}

export function toHex(color: Rgb): string {
    return '#' + [color.r, color.g, color.b]
        .map(channel => clampChannel(channel).toString(16).padStart(2, '0'))
        .join('');
}

export function toRgbString(color: Rgb): string {
    return [clampChannel(color.r), clampChannel(color.g), clampChannel(color.b)].join(', ');
}

export function rgbToHsl(color: Rgb): Hsl {
    const r = color.r / 255;
    const g = color.g / 255;
    const b = color.b / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const delta = max - min;
    const l = (max + min) / 2;

    if (!delta) {
        return {h: 0, s: 0, l};
    }

    const s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min);
    let h: number;
    if (max === r) {
        h = ((g - b) / delta) % 6;
    } else if (max === g) {
        h = (b - r) / delta + 2;
    } else {
        h = (r - g) / delta + 4;
    }
    h *= 60;
    return {h: (h + 360) % 360, s, l};
}

export function hslToRgb(hsl: Hsl): Rgb {
    const h = ((hsl.h % 360) + 360) % 360;
    const s = Math.min(1, Math.max(0, hsl.s));
    const l = Math.min(1, Math.max(0, hsl.l));
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;
    const sector = Math.floor(h / 60) % 6;
    const table: [number, number, number][] = [
        [c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x],
    ];
    const [r, g, b] = table[sector];
    return {r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255};
}

/** Blend `weight` of `color` with `(1 - weight)` of `onto`. */
export function mix(color: Rgb, onto: Rgb, weight: number): Rgb {
    const ratio = Math.min(1, Math.max(0, weight));
    return {
        r: color.r * ratio + onto.r * (1 - ratio),
        g: color.g * ratio + onto.g * (1 - ratio),
        b: color.b * ratio + onto.b * (1 - ratio),
    };
}

export function shade(color: Rgb, amount: number): Rgb {
    return mix(BLACK, color, amount);
}

export function tint(color: Rgb, amount: number): Rgb {
    return mix(WHITE, color, amount);
}

export function rotateHue(color: Rgb, degrees: number): Rgb {
    const hsl = rgbToHsl(color);
    return hslToRgb({...hsl, h: hsl.h + degrees});
}

export function withHue(color: Rgb, hue: number): Rgb {
    const hsl = rgbToHsl(color);
    return hslToRgb({...hsl, h: hue});
}

export function relativeLuminance(color: Rgb): number {
    const channels = [color.r, color.g, color.b].map(channel => {
        const value = Math.min(255, Math.max(0, channel)) / 255;
        return value <= 0.03928 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

export function contrastRatio(a: Rgb, b: Rgb): number {
    const first = relativeLuminance(a);
    const second = relativeLuminance(b);
    const lighter = Math.max(first, second);
    const darker = Math.min(first, second);
    return (lighter + 0.05) / (darker + 0.05);
}

/** Whichever of black or white text is more readable on `background`. */
export function readableOn(background: Rgb): Rgb {
    return contrastRatio(background, WHITE) >= contrastRatio(background, BLACK) ? WHITE : BLACK;
}

/**
 * Lighten or darken `color` until it reaches `minRatio` against `background`, keeping its
 * hue and saturation so a themed colour stays vivid rather than washing out to grey.
 */
export function adjustLightnessToContrast(color: Rgb, background: Rgb, minRatio: number, step = 0.04): Rgb {
    if (contrastRatio(color, background) >= minRatio) {
        return color;
    }
    const hsl = rgbToHsl(color);
    const lighten = relativeLuminance(background) < 0.5;
    let best = color;
    for (let offset = step; offset <= 1; offset += step) {
        const lightness = lighten ? hsl.l + offset : hsl.l - offset;
        if (lightness <= 0 || lightness >= 1) {
            break;
        }
        best = hslToRgb({...hsl, l: lightness});
        if (contrastRatio(best, background) >= minRatio) {
            return best;
        }
    }
    return best;
}

/**
 * Nudge `color` lighter or darker until it reaches `minRatio` against `background`,
 * so a colour picked without regard for contrast still renders legibly.
 */
export function ensureContrast(color: Rgb, background: Rgb, minRatio: number): Rgb {
    if (contrastRatio(color, background) >= minRatio) {
        return color;
    }
    const target = relativeLuminance(background) > 0.5 ? BLACK : WHITE;
    let low = 0;
    let high = 1;
    let result = mix(target, color, high);
    for (let i = 0; i < 12; i++) {
        const middle = (low + high) / 2;
        const candidate = mix(target, color, middle);
        if (contrastRatio(candidate, background) >= minRatio) {
            result = candidate;
            high = middle;
        } else {
            low = middle;
        }
    }
    return result;
}
