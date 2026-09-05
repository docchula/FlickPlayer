import {DestroyRef, inject, Injectable} from '@angular/core';
import {BehaviorSubject, Observable} from 'rxjs';
import {distinctUntilChanged, map} from 'rxjs/operators';
import {ulid} from 'ulid';
import {AuthService} from './auth.service';
import {BLACK, isValidColor, parseColor, readableOn, toHex} from './theme/color';
import {buildThemeVariables, CssVariables, shadeForColor} from './theme/palette';
import {
    BACKGROUND_FIT_OPTIONS,
    DEFAULT_BACKGROUND,
    defaultCustomTheme,
    defaultThemeSettings,
    findTemplate,
    DEFAULT_CUSTOM_SHADE,
    THEME_SHADES,
    NEUTRAL_SEED,
    MAX_REMEMBERED_SHADES,
    MAX_SAVED_COLORS,
    OWN_COLOR_INTENSITY,
    STANDARD_MODES,
    OWN_COLOR_TEMPLATE_ID,
    THEME_MODES,
    THEME_TEMPLATES,
} from './theme/theme-presets';
import {BackgroundImageStore, prepareBackgroundImage} from './theme/background-store';
import {
    BackgroundFit,
    ColorScheme,
    ThemeShade,
    ThemeTemplate,
    ThemeVariables,
    CustomTheme,
    SchemePreference,
    ThemeBackground,
    ThemeMode,
    ThemeModeOption,
    ThemeSeed,
    ThemeSettings,
} from './theme/theme.model';

/** Mirrors the last applied palette so index.html can paint it before Angular boots. */
export const APPLIED_THEME_KEY = 'flickThemeApplied';
export const THEME_STORAGE_KEY_PREFIX = 'flickTheme_';
/** Colours the reader has kept. They stay on this device, like the background picture. */
export const SAVED_COLORS_KEY_PREFIX = 'flickThemeColors_';
/** The shade last chosen for each colour and template. Kept on the device, like the rest. */
export const SHADE_MEMORY_KEY_PREFIX = 'flickThemeShades_';
export const BACKGROUND_IMAGE_CLASS = 'flick-has-background-image';
/**
 * Set on the document element for the length of a change of theme. The colour variables are
 * interpolated while it is present, so every surface reading them moves together instead of
 * each component fading on whatever timing its own stylesheet happens to carry.
 */
export const THEME_ANIMATING_CLASS = 'flick-theme-animating';
/** Kept in step with --flick-theme-transition-duration in the global stylesheet. */
export const THEME_TRANSITION_MS = 280;
/** Kept in step with --flick-theme-transition-easing in the global stylesheet. */
const THEME_TRANSITION_EASING: [number, number, number, number] = [0.4, 0, 0.2, 1];

/**
 * Ionic draws some borders and overlays as rgba(var(--…-rgb), alpha). A channel triplet is a
 * comma list rather than a colour, so CSS cannot interpolate it and it would jump from black
 * to white the instant a theme changed, drawing a hard line across a page whose every other
 * colour was still moving. These are moved by hand instead, on the same curve and clock.
 */
function parseTriplet(value: string): [number, number, number] | null {
    const parts = value.split(',').map(part => Number(part.trim()));
    return parts.length === 3 && parts.every(part => Number.isFinite(part))
        ? [parts[0], parts[1], parts[2]]
        : null;
}

function bezierAxis(t: number, a: number, b: number): number {
    return 3 * (1 - t) * (1 - t) * t * a + 3 * (1 - t) * t * t * b + t * t * t;
}

/** The y of a cubic bezier at a given x, solved closely enough for a colour channel. */
function easeWith(progress: number, [x1, y1, x2, y2]: [number, number, number, number]): number {
    let low = 0;
    let high = 1;
    let t = progress;
    for (let i = 0; i < 12; i++) {
        const x = bezierAxis(t, x1, x2);
        if (x < progress) {
            low = t;
        } else {
            high = t;
        }
        t = (low + high) / 2;
    }
    return bezierAxis(t, y1, y2);
}
const GUEST_ID = 'guest';

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

/** One spelling per colour, so the saved list cannot hold the same colour twice. */
function normalizeColor(value: unknown): string | null {
    if (typeof value !== 'string') {
        return null;
    }
    const parsed = parseColor(value);
    return parsed ? toHex(parsed) : null;
}

function sanitizeColor(value: unknown): string | null {
    return typeof value === 'string' && isValidColor(value) ? value : null;
}

function sanitizeSeed(raw: unknown): ThemeSeed {
    const seed = (raw ?? {}) as Partial<ThemeSeed>;
    return {
        accent: sanitizeColor(seed.accent),
        companion: sanitizeColor(seed.companion),
        tertiary: sanitizeColor(seed.tertiary),
        surfaceTint: sanitizeColor(seed.surfaceTint),
        intensity: clamp(Number(seed.intensity) || 0, 0, 1),
    };
}

function sanitizeCustom(raw: unknown): CustomTheme {
    const fallback = defaultCustomTheme();
    const value = (raw ?? {}) as Partial<CustomTheme>;
    const background = (value.background ?? {}) as Partial<ThemeBackground>;
    const templateId = typeof value.templateId === 'string'
        && (value.templateId === OWN_COLOR_TEMPLATE_ID || !!findTemplate(value.templateId))
        ? value.templateId
        : fallback.templateId;
    const template = findTemplate(templateId);
    // Only a stored background speaks for the user; without one the template's own page
    // colour applies, so opening the editor matches picking that template.
    const storedBackground = !!value.background;
    return {
        templateId,
        shade: THEME_SHADES.some(option => option.value === value.shade)
            ? value.shade as ThemeShade
            : fallback.shade,
        seed: template ? {...template.seed} : sanitizeSeed(value.seed),
        background: {
            color: storedBackground ? sanitizeColor(background.color) : (template?.background ?? null),
            imageId: typeof background.imageId === 'string' ? background.imageId : null,
            imageOpacity: clamp(Number(background.imageOpacity ?? DEFAULT_BACKGROUND.imageOpacity), 0, 1),
            imageBlur: clamp(Number(background.imageBlur ?? DEFAULT_BACKGROUND.imageBlur), 0, 20),
            imageFit: BACKGROUND_FIT_OPTIONS.some(option => option.value === background.imageFit)
                ? background.imageFit as BackgroundFit
                : DEFAULT_BACKGROUND.imageFit,
        },
    };
}

/** Accept only values this build understands, so stored data can never break rendering. */
export function sanitizeSettings(raw: unknown): ThemeSettings {
    const fallback = defaultThemeSettings();
    const value = (raw ?? {}) as Partial<ThemeSettings>;
    return {
        mode: THEME_MODES.some(option => option.value === value.mode)
            ? value.mode as ThemeMode
            : fallback.mode,
        custom: sanitizeCustom(value.custom),
        updatedAt: Number(value.updatedAt) || 0,
    };
}

@Injectable({
    providedIn: 'root',
})
export class ThemeService {
    private imageStore = new BackgroundImageStore();

    readonly modes = THEME_MODES;
    readonly templates = THEME_TEMPLATES;
    readonly standardModes = STANDARD_MODES;
    readonly shades = THEME_SHADES;
    readonly backgroundFitOptions = BACKGROUND_FIT_OPTIONS;

    private readonly settingsSubject = new BehaviorSubject<ThemeSettings>(defaultThemeSettings());
    private readonly schemeSubject = new BehaviorSubject<ColorScheme>('light');
    private readonly imageUrlSubject = new BehaviorSubject<string | null>(null);
    private readonly savedColorsSubject = new BehaviorSubject<string[]>([]);

    readonly settings$: Observable<ThemeSettings> = this.settingsSubject.asObservable();
    readonly scheme$: Observable<ColorScheme> = this.schemeSubject.asObservable();
    readonly backgroundImageUrl$: Observable<string | null> = this.imageUrlSubject.asObservable();
    readonly savedColors$: Observable<string[]> = this.savedColorsSubject.asObservable();
    readonly mode$: Observable<ThemeMode> = this.settings$.pipe(
        map(settings => settings.mode),
        distinctUntilChanged(),
    );
    readonly modeOption$: Observable<ThemeModeOption> = this.mode$.pipe(
        map(mode => this.modes.find(option => option.value === mode) ?? this.modes[0]),
    );

    private userId = GUEST_ID;
    private shadeMemory: [string, ThemeShade][] = [];
    private painted = false;
    private animationTimer: number | null = null;
    private tweenFrame: number | null = null;
    private objectUrl: string | null = null;
    private darkQuery: MediaQueryList | null = null;

    constructor() {
        const destroyRef = inject(DestroyRef);
        this.darkQuery = window.matchMedia?.('(prefers-color-scheme: dark)') ?? null;
        const onSystemChange = () => this.apply(this.settingsSubject.value, false);
        this.darkQuery?.addEventListener('change', onSystemChange);
        destroyRef.onDestroy(() => {
            this.darkQuery?.removeEventListener('change', onSystemChange);
            if (this.animationTimer !== null) {
                clearTimeout(this.animationTimer);
            }
            if (this.tweenFrame !== null) {
                cancelAnimationFrame(this.tweenFrame);
            }
            this.releaseObjectUrl();
        });

        this.apply(this.readLocal(GUEST_ID), false);
        this.savedColorsSubject.next(this.readSavedColors(GUEST_ID));
        this.shadeMemory = this.readShadeMemory(GUEST_ID);

        inject(AuthService).user.subscribe(user => {
            if (user?.uid) {
                this.attachUser(user.uid);
            } else if (this.userId !== GUEST_ID) {
                this.detachUser();
            }
        });
    }

    get settings(): ThemeSettings {
        return this.settingsSubject.value;
    }

    get scheme(): ColorScheme {
        return this.schemeSubject.value;
    }

    get mode(): ThemeMode {
        return this.settings.mode;
    }

    setMode(mode: ThemeMode): void {
        this.update({mode});
    }

    /**
     * A template starts light, the shade it states its own colours for, unless a shade has
     * since been chosen for it.
     */
    selectTemplate(templateId: string): void {
        const template = findTemplate(templateId);
        if (!template) {
            return;
        }
        const shade = this.rememberedShade(templateId) ?? DEFAULT_CUSTOM_SHADE;
        this.updateCustom({
            templateId: template.id,
            shade,
            seed: {...template.seed},
            background: {...this.settings.custom.background, color: this.pageForTemplate(template, shade)},
        });
    }

    /**
     * A colour lands on the shade last chosen for it, or the shade it belongs to when there is
     * none, so it appears as it was last seen rather than on the previous theme's page.
     */
    setAccent(accent: string): void {
        if (!isValidColor(accent)) {
            return;
        }
        this.updateCustom({
            templateId: OWN_COLOR_TEMPLATE_ID,
            shade: this.rememberedShade(normalizeColor(accent)) ?? shadeForColor(accent),
            seed: {
                accent,
                companion: null,
                tertiary: null,
                surfaceTint: null,
                intensity: OWN_COLOR_INTENSITY,
            },
            background: {...this.settings.custom.background, color: null},
        });
    }

    /** The page is let go with the shade, so it is derived for the new one. */
    setCustomShade(shade: ThemeShade): void {
        const custom = this.settings.custom;
        this.rememberShade(custom, shade);
        const template = findTemplate(custom.templateId);
        this.updateCustom({
            shade,
            background: {
                ...custom.background,
                color: template ? this.pageForTemplate(template, shade) : null,
            },
        });
    }

    setBackgroundColor(color: string | null): void {
        if (color !== null && !isValidColor(color)) {
            return;
        }
        this.updateCustom({background: {...this.settings.custom.background, color}});
    }

    setBackgroundFit(imageFit: BackgroundFit): void {
        this.updateCustom({background: {...this.settings.custom.background, imageFit}});
    }

    setBackgroundOpacity(imageOpacity: number): void {
        this.updateCustom({background: {...this.settings.custom.background, imageOpacity: clamp(imageOpacity, 0, 1)}});
    }

    setBackgroundBlur(imageBlur: number): void {
        this.updateCustom({background: {...this.settings.custom.background, imageBlur: clamp(imageBlur, 0, 20)}});
    }

    /** Store an uploaded picture on this device and use it as the page background. */
    async setBackgroundImage(file: File): Promise<void> {
        const image = await prepareBackgroundImage(file);
        const imageId = ulid();
        await this.imageStore.save(imageId, image);
        await this.imageStore.prune(imageId);
        this.updateCustom({background: {...this.settings.custom.background, imageId}});
    }

    async clearBackgroundImage(): Promise<void> {
        const {imageId} = this.settings.custom.background;
        if (imageId) {
            await this.imageStore.remove(imageId);
        }
        this.updateCustom({background: {...this.settings.custom.background, imageId: null}});
    }

    get savedColors(): string[] {
        return this.savedColorsSubject.value;
    }

    isColorSaved(color: string): boolean {
        const normalized = normalizeColor(color);
        return !!normalized && this.savedColors.includes(normalized);
    }

    /** Keep a colour for later. The newest sits first, and the oldest falls off the end. */
    saveColor(color: string): void {
        const normalized = normalizeColor(color);
        if (!normalized) {
            return;
        }
        const kept = [normalized, ...this.savedColors.filter(saved => saved !== normalized)]
            .slice(0, MAX_SAVED_COLORS);
        this.savedColorsSubject.next(kept);
        this.writeSavedColors(kept);
    }

    removeColor(color: string): void {
        const normalized = normalizeColor(color);
        if (!normalized) {
            return;
        }
        const kept = this.savedColors.filter(saved => saved !== normalized);
        this.savedColorsSubject.next(kept);
        this.writeSavedColors(kept);
    }

    /** The page the custom theme renders, whether it was named or derived. */
    customPageColor(custom: CustomTheme): string {
        return custom.background.color
            ?? buildThemeVariables(
                custom.seed,
                this.schemeFor(custom, custom.background),
                custom.background,
                this.templateVariables(custom),
                custom.shade,
            )['--ion-background-color'];
    }

    /**
     * Which base palette the theme builds on. Light and dark say so; filled it follows the
     * page itself, so a colour kept dark keeps dark surfaces and course colours.
     */
    private schemeFor(custom: CustomTheme, background: ThemeBackground): ColorScheme {
        if (custom.shade !== 'fill') {
            return custom.shade;
        }
        const page = background.color ?? custom.seed.surfaceTint ?? custom.seed.accent;
        const parsed = page ? parseColor(page) : null;
        return parsed && readableOn(parsed) === BLACK ? 'light' : 'dark';
    }

    resetToDefault(): void {
        this.update(defaultThemeSettings());
    }

    /** Palette for a seed without applying it, used to preview a template in the picker. */
    preview(seed: ThemeSeed, shade: ThemeShade = this.settings.custom.shade): CssVariables {
        const custom = {...this.settings.custom, seed, shade, background: {...DEFAULT_BACKGROUND}};
        return buildThemeVariables(
            seed, this.schemeFor(custom, custom.background), custom.background, undefined, shade);
    }

    private updateCustom(change: Partial<CustomTheme>): void {
        this.update({mode: 'custom', custom: {...this.settings.custom, ...change}});
    }

    private update(change: Partial<ThemeSettings>): void {
        this.apply({...this.settings, ...change, updatedAt: Date.now()}, true);
    }

    /** The standard modes deliberately carry no colour, picture or background of their own. */
    private resolve(settings: ThemeSettings): {
        scheme: ColorScheme,
        shade: ThemeShade,
        seed: ThemeSeed,
        background: ThemeBackground,
        variables?: ThemeVariables,
    } {
        if (settings.mode === 'custom') {
            const custom = settings.custom;
            return {
                scheme: this.schemeFor(custom, custom.background),
                shade: custom.shade,
                seed: custom.seed,
                background: custom.background,
                variables: this.templateVariables(custom),
            };
        }
        const scheme = this.resolveScheme(settings.mode);
        return {
            scheme,
            shade: scheme,
            seed: {...NEUTRAL_SEED},
            background: {...DEFAULT_BACKGROUND},
        };
    }

    /**
     * A template's stated colours hold while its own colours are still in place. Once the
     * theme is adjusted in the editor they are left behind, so what was chosen is what the
     * palette is derived from.
     */
    private templateVariables(custom: CustomTheme): ThemeVariables | undefined {
        const template = findTemplate(custom.templateId);
        if (!template?.variables) {
            return undefined;
        }
        const keys = Object.keys(template.seed) as (keyof ThemeSeed)[];
        const untouched = keys.every(key => custom.seed[key] === template.seed[key])
            && custom.background.color === template.background
            && custom.shade === DEFAULT_CUSTOM_SHADE;
        return untouched ? template.variables : undefined;
    }

    private apply(settings: ThemeSettings, persist: boolean): void {
        const resolved = this.resolve(settings);
        const {scheme, seed, background} = resolved;
        const variables = buildThemeVariables(seed, scheme, background, resolved.variables, resolved.shade);

        // The first paint is the colours arriving, not changing, so it is not animated.
        const animate = this.painted;
        if (animate) {
            this.animateChange();
        }
        this.painted = true;

        const root = document.documentElement;
        const previous = animate ? this.readTriplets(root, variables) : null;
        root.setAttribute('data-theme', scheme);
        for (const [name, value] of Object.entries(variables)) {
            root.style.setProperty(name, value);
        }
        if (previous) {
            this.tweenTriplets(root, previous, variables);
        }

        this.updateBrowserThemeColor(variables['--ion-toolbar-background']);
        this.schemeSubject.next(scheme);
        this.settingsSubject.next(settings);
        this.writeAppliedMirror(scheme, variables);
        void this.applyBackgroundImage(background.imageId);

        if (persist) {
            this.writeLocal(settings);
        }
    }

    /**
     * Hold the transition class over the change so every element, whatever stylesheet it
     * came with, moves to the new colours on one timing.
     */
    private animateChange(): void {
        const {classList} = document.documentElement;
        classList.add(THEME_ANIMATING_CLASS);
        if (this.animationTimer !== null) {
            clearTimeout(this.animationTimer);
        }
        this.animationTimer = window.setTimeout(() => {
            classList.remove(THEME_ANIMATING_CLASS);
            this.animationTimer = null;
        }, THEME_TRANSITION_MS);
    }

    private readTriplets(root: HTMLElement, target: CssVariables): Map<string, [number, number, number]> {
        const previous = new Map<string, [number, number, number]>();
        for (const name of Object.keys(target)) {
            if (!name.endsWith('-rgb')) {
                continue;
            }
            const from = parseTriplet(root.style.getPropertyValue(name));
            const to = parseTriplet(target[name]);
            if (from && to && from.some((channel, index) => channel !== to[index])) {
                previous.set(name, from);
            }
        }
        return previous;
    }

    private tweenTriplets(
        root: HTMLElement,
        previous: Map<string, [number, number, number]>,
        target: CssVariables,
    ): void {
        if (this.tweenFrame !== null) {
            cancelAnimationFrame(this.tweenFrame);
            this.tweenFrame = null;
        }
        const moves = [...previous].map(([name, from]) => ({name, from, to: parseTriplet(target[name])}));
        if (!moves.length) {
            return;
        }
        const started = performance.now();
        const step = (now: number) => {
            const progress = Math.min(1, (now - started) / THEME_TRANSITION_MS);
            const eased = easeWith(progress, THEME_TRANSITION_EASING);
            for (const {name, from, to} of moves) {
                const channels = from.map((channel, index) =>
                    Math.round(channel + (to[index] - channel) * eased));
                root.style.setProperty(name, channels.join(', '));
            }
            this.tweenFrame = progress < 1 ? requestAnimationFrame(step) : null;
        };
        this.tweenFrame = requestAnimationFrame(step);
    }

    private resolveScheme(preference: SchemePreference): ColorScheme {
        if (preference === 'system') {
            return this.darkQuery?.matches ? 'dark' : 'light';
        }
        return preference;
    }

    /** Keep the browser chrome (address bar, task switcher) in step with the theme. */
    private updateBrowserThemeColor(color: string): void {
        const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
        if (meta) {
            meta.content = color;
        }
    }

    private async applyBackgroundImage(imageId: string | null): Promise<void> {
        const image = imageId ? await this.imageStore.load(imageId) : null;
        this.releaseObjectUrl();
        if (image) {
            this.objectUrl = URL.createObjectURL(image);
        }
        const root = document.documentElement;
        root.style.setProperty('--flick-background-image', this.objectUrl ? `url("${this.objectUrl}")` : 'none');
        document.body.classList.toggle(BACKGROUND_IMAGE_CLASS, !!this.objectUrl);
        this.imageUrlSubject.next(this.objectUrl);
    }

    private releaseObjectUrl(): void {
        if (this.objectUrl) {
            URL.revokeObjectURL(this.objectUrl);
            this.objectUrl = null;
        }
    }

    private attachUser(uid: string): void {
        if (this.userId === uid) {
            return;
        }
        const guestSettings = this.userId === GUEST_ID ? this.settings : null;
        this.userId = uid;
        const stored = this.readLocal(uid);
        const adoptGuest = guestSettings && guestSettings.updatedAt > stored.updatedAt;
        this.apply(adoptGuest ? guestSettings : stored, adoptGuest);
        this.savedColorsSubject.next(this.readSavedColors(uid));
        this.shadeMemory = this.readShadeMemory(uid);
    }

    private detachUser(): void {
        this.userId = GUEST_ID;
        this.apply(this.readLocal(GUEST_ID), false);
        this.savedColorsSubject.next(this.readSavedColors(GUEST_ID));
        this.shadeMemory = this.readShadeMemory(GUEST_ID);
    }

    /**
     * A template states its colours for the light shade, so its own page belongs to that shade
     * alone; any other derives the page from the colour instead.
     */
    private pageForTemplate(template: ThemeTemplate, shade: ThemeShade): string | null {
        return shade === DEFAULT_CUSTOM_SHADE ? template.background : null;
    }

    /** What a colour or template is remembered under: templates keep their own identity. */
    private shadeKey(custom: CustomTheme): string | null {
        return custom.templateId === OWN_COLOR_TEMPLATE_ID
            ? normalizeColor(custom.seed.accent)
            : custom.templateId;
    }

    private rememberedShade(key: string | null): ThemeShade | null {
        return key ? this.shadeMemory.find(([saved]) => saved === key)?.[1] ?? null : null;
    }

    private rememberShade(custom: CustomTheme, shade: ThemeShade): void {
        const key = this.shadeKey(custom);
        if (!key) {
            return;
        }
        this.shadeMemory = [[key, shade] as [string, ThemeShade],
            ...this.shadeMemory.filter(([saved]) => saved !== key)]
            .slice(0, MAX_REMEMBERED_SHADES);
        try {
            localStorage.setItem(SHADE_MEMORY_KEY_PREFIX + this.userId, JSON.stringify(this.shadeMemory));
        } catch {
            // Storage may be unavailable; the shade still holds for this session.
        }
    }

    private readShadeMemory(uid: string): [string, ThemeShade][] {
        try {
            const raw = localStorage.getItem(SHADE_MEMORY_KEY_PREFIX + uid);
            const parsed: unknown = raw ? JSON.parse(raw) : null;
            if (!Array.isArray(parsed)) {
                return [];
            }
            return parsed
                .filter((entry): entry is [string, ThemeShade] => Array.isArray(entry)
                    && typeof entry[0] === 'string'
                    && THEME_SHADES.some(option => option.value === entry[1]))
                .slice(0, MAX_REMEMBERED_SHADES);
        } catch {
            return [];
        }
    }

    private readSavedColors(uid: string): string[] {
        try {
            const raw = localStorage.getItem(SAVED_COLORS_KEY_PREFIX + uid);
            const parsed: unknown = raw ? JSON.parse(raw) : null;
            if (!Array.isArray(parsed)) {
                return [];
            }
            const colors = parsed
                // Entries kept while a colour also carried a page of its own are read as colours.
                .map(entry => normalizeColor(typeof entry === 'string' ? entry : entry?.color))
                .filter((color): color is string => color !== null);
            return [...new Set(colors)].slice(0, MAX_SAVED_COLORS);
        } catch {
            return [];
        }
    }

    private writeSavedColors(colors: string[]): void {
        try {
            localStorage.setItem(SAVED_COLORS_KEY_PREFIX + this.userId, JSON.stringify(colors));
        } catch {
            // Storage may be unavailable; the colours still stand for this session.
        }
    }

    private readLocal(uid: string): ThemeSettings {
        try {
            const raw = localStorage.getItem(THEME_STORAGE_KEY_PREFIX + uid);
            return sanitizeSettings(raw ? JSON.parse(raw) : null);
        } catch {
            return defaultThemeSettings();
        }
    }

    private writeLocal(settings: ThemeSettings): void {
        try {
            localStorage.setItem(THEME_STORAGE_KEY_PREFIX + this.userId, JSON.stringify(settings));
        } catch {
            // Storage may be unavailable; the theme still applies for this session.
        }
    }

    private writeAppliedMirror(scheme: ColorScheme, variables: CssVariables): void {
        try {
            localStorage.setItem(APPLIED_THEME_KEY, JSON.stringify({scheme, variables}));
        } catch {
            // Without the mirror the first paint falls back to the default palette.
        }
    }
}

export {OWN_COLOR_TEMPLATE_ID};
