import {DestroyRef, inject, Injectable} from '@angular/core';
import {BehaviorSubject, Observable} from 'rxjs';
import {distinctUntilChanged, map} from 'rxjs/operators';
import {ulid} from 'ulid';
import {AuthService} from './auth.service';
import {UserSyncService} from './user-sync.service';
import {RestoreDefaultsService} from './restore-defaults.service';
import {BLACK, isValidColor, parseColor, readableOn, toHex} from './theme/color';
import {buildThemeVariables, CssVariables, shadeForColor} from './theme/palette';
import {
    BACKGROUND_FIT_OPTIONS,
    BACKGROUND_PICTURE_MODES,
    DEFAULT_BACKGROUND,
    defaultCustomTheme,
    defaultThemeSettings,
    findTemplate,
    DEFAULT_CUSTOM_SHADE,
    THEME_SHADES,
    NEUTRAL_SEED,
    MAX_SAVED_COLORS,
    OWN_COLOR_INTENSITY,
    OWN_COLOR_TEMPLATE_ID,
    THEME_MODES,
    THEME_TEMPLATES,
    THEME_TEMPLATE_GROUPS,
    SLIDESHOW_INTERVALS,
} from './theme/theme-presets';
import {BackgroundImageStore, prepareBackgroundImage} from './theme/background-store';
import {
    BackgroundFit,
    BackgroundPictureMode,
    ColorScheme,
    ThemeShade,
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
/** Colours the reader has kept. They travel with the theme; the background picture does not. */
export const SAVED_COLORS_KEY_PREFIX = 'flickThemeColors_';
export const BACKGROUND_IMAGE_CLASS = 'flick-has-background-image';
/** Fades the picture out while the slideshow swaps it, for the length of BACKGROUND_FADE_MS. */
export const BACKGROUND_FADING_CLASS = 'flick-background-fading';
/** Kept in step with the opacity transition on the picture in the global stylesheet. */
export const BACKGROUND_FADE_MS = 600;
/** The longest delay setTimeout honours; anything above it fires at once. */
const MAX_TIMEOUT_MS = 2 ** 31 - 1;
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

function sanitizeSavedColors(entries: unknown[]): string[] {
    const colors = entries
        // Entries kept while a colour also carried a page of its own are read as colours.
        .map(entry => normalizeColor(typeof entry === 'string' ? entry : (entry as {color?: unknown})?.color))
        .filter((color): color is string => color !== null);
    return [...new Set(colors)].slice(0, MAX_SAVED_COLORS);
}

function sanitizeColor(value: unknown): string | null {
    return typeof value === 'string' && isValidColor(value) ? value : null;
}

/** Which picture shows is decided on each device, since the pictures themselves stay there. */
type DevicePicture = Pick<ThemeBackground,
    'imageId' | 'pictureMode' | 'slideshowMinutes' | 'slideshowShuffle' | 'slideshowSince'>;

function devicePicture(background: ThemeBackground): DevicePicture {
    const {imageId, pictureMode, slideshowMinutes, slideshowShuffle, slideshowSince} = background;
    return {imageId, pictureMode, slideshowMinutes, slideshowShuffle, slideshowSince};
}

/** The same order every time for a given seed, so a reload lands on the same picture. */
function shuffled(ids: string[], seed: number): string[] {
    const order = [...ids];
    let state = seed >>> 0;
    const random = () => {
        state = (state + 0x6D2B79F5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [order[i], order[j]] = [order[j], order[i]];
    }
    return order;
}

/**
 * The slideshow picture at a moment, and when it next changes. The pictures go round in the
 * order they were added, or with shuffle on, in a new order each time round so that every
 * picture shows once before any repeats.
 */
export function slideshowPicture(ids: string[], background: ThemeBackground, now: number): {
    id: string | null,
    changesAt: number | null,
} {
    if (!ids.length) {
        return {id: null, changesAt: null};
    }
    const interval = background.slideshowMinutes * 60000;
    const since = Math.min(background.slideshowSince, now);
    const step = Math.floor((now - since) / interval);
    const round = Math.floor(step / ids.length);
    // Two pictures can only alternate, and shuffling them would show one twice running.
    let order = ids;
    if (background.slideshowShuffle && ids.length > 2) {
        order = shuffled(ids, since + round);
        // A new round must not open on the picture the last one ended with.
        if (round > 0 && order[0] === shuffled(ids, since + round - 1)[ids.length - 1]) {
            order = [order[1], order[0], ...order.slice(2)];
        }
    }
    return {
        id: order[step % ids.length],
        changesAt: ids.length > 1 ? since + (step + 1) * interval : null,
    };
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
            // Saved before there was a choice, a stored picture meant it was on show.
            pictureMode: BACKGROUND_PICTURE_MODES.some(option => option.value === background.pictureMode)
                ? background.pictureMode as BackgroundPictureMode
                : (typeof background.imageId === 'string' ? 'single' : 'none'),
            slideshowMinutes: SLIDESHOW_INTERVALS.some(option => option.minutes === background.slideshowMinutes)
                ? background.slideshowMinutes as number
                : DEFAULT_BACKGROUND.slideshowMinutes,
            slideshowShuffle: background.slideshowShuffle === true,
            slideshowSince: Math.max(0, Number(background.slideshowSince) || 0),
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
    private sync = inject(UserSyncService);

    readonly modes = THEME_MODES;
    readonly templates = THEME_TEMPLATES;
    readonly templateGroups = THEME_TEMPLATE_GROUPS;
    readonly backgroundFitOptions = BACKGROUND_FIT_OPTIONS;
    readonly pictureModes = BACKGROUND_PICTURE_MODES;
    readonly slideshowIntervals = SLIDESHOW_INTERVALS;

    private readonly settingsSubject = new BehaviorSubject<ThemeSettings>(defaultThemeSettings());
    private readonly schemeSubject = new BehaviorSubject<ColorScheme>('light');
    private readonly imageUrlSubject = new BehaviorSubject<string | null>(null);
    private readonly savedColorsSubject = new BehaviorSubject<string[]>([]);
    private readonly pictureIdsSubject = new BehaviorSubject<string[]>([]);
    private readonly shownPictureSubject = new BehaviorSubject<string | null>(null);

    readonly settings$: Observable<ThemeSettings> = this.settingsSubject.asObservable();
    readonly scheme$: Observable<ColorScheme> = this.schemeSubject.asObservable();
    readonly backgroundImageUrl$: Observable<string | null> = this.imageUrlSubject.asObservable();
    readonly savedColors$: Observable<string[]> = this.savedColorsSubject.asObservable();
    /** Every picture kept on this device, oldest first. */
    readonly pictureIds$: Observable<string[]> = this.pictureIdsSubject.asObservable();
    /** The picture on the page right now, which the slideshow moves along. */
    readonly shownPictureId$: Observable<string | null> = this.shownPictureSubject.asObservable();
    readonly mode$: Observable<ThemeMode> = this.settings$.pipe(
        map(settings => settings.mode),
        distinctUntilChanged(),
    );
    readonly modeOption$: Observable<ThemeModeOption> = this.mode$.pipe(
        map(mode => this.modes.find(option => option.value === mode) ?? this.modes[0]),
    );

    private userId = GUEST_ID;
    private painted = false;
    private animationTimer: number | null = null;
    private tweenFrame: number | null = null;
    private objectUrl: string | null = null;
    private pictureTicket = 0;
    private slideshowTimer: number | null = null;
    private libraryLoaded = this.reloadLibrary();
    private darkQuery: MediaQueryList | null = null;

    constructor() {
        const destroyRef = inject(DestroyRef);
        this.darkQuery = window.matchMedia?.('(prefers-color-scheme: dark)') ?? null;
        const onSystemChange = () => this.apply(this.settingsSubject.value, false);
        this.darkQuery?.addEventListener('change', onSystemChange);
        // A hidden tab's timers are held back, so a slideshow catches up when the page returns.
        const onVisible = () => {
            if (!document.hidden) {
                void this.showBackgroundPicture(this.resolve(this.settings).background, true);
            }
        };
        document.addEventListener('visibilitychange', onVisible);
        destroyRef.onDestroy(() => {
            this.darkQuery?.removeEventListener('change', onSystemChange);
            document.removeEventListener('visibilitychange', onVisible);
            this.clearSlideshowTimer();
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

        inject(AuthService).user.subscribe(user => {
            if (user?.uid) {
                this.attachUser(user.uid);
            } else if (this.userId !== GUEST_ID) {
                this.detachUser();
            }
        });

        inject(RestoreDefaultsService).restore$.subscribe(() => this.restorePlainLight());
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

    /** A template brings its own page, on the light shade its colours are stated for. */
    selectTemplate(templateId: string): void {
        const template = findTemplate(templateId);
        if (!template) {
            return;
        }
        this.updateCustom({
            templateId: template.id,
            shade: DEFAULT_CUSTOM_SHADE,
            seed: {...template.seed},
            background: {...this.settings.custom.background, color: template.background},
        });
    }

    /** The primary colour: buttons, links and highlights. The page and secondary colour stay put. */
    setAccent(accent: string): void {
        if (!isValidColor(accent)) {
            return;
        }
        this.updateSeed({accent});
    }

    /** Null hands the secondary colour back to the primary, which picks one that goes with it. */
    setSecondaryColor(companion: string | null): void {
        if (companion !== null && !isValidColor(companion)) {
            return;
        }
        this.updateSeed({companion, tertiary: null});
    }

    /**
     * 'light' and 'dark' derive the page from the primary colour. Any colour is the page itself,
     * used exactly, with the cards and toolbars on it drawn from the same colour. Either way the
     * text is dark or light by what the page needs.
     */
    setPage(page: string): void {
        const custom = this.settings.custom;
        const derived = page === 'light' || page === 'dark';
        if (!derived && !isValidColor(page)) {
            return;
        }
        this.updateCustom({
            templateId: OWN_COLOR_TEMPLATE_ID,
            shade: derived ? page as ThemeShade : shadeForColor(page),
            seed: {...custom.seed, surfaceTint: derived ? null : page, intensity: OWN_COLOR_INTENSITY},
            background: {...custom.background, color: derived ? null : page},
        });
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

    /**
     * Add pictures to this device's folder. The last one goes on show, unless a slideshow is
     * running, which takes it into the rotation instead. Returns how many could not be used.
     */
    async addBackgroundImages(files: File[]): Promise<number> {
        let failed = 0;
        let added: string | null = null;
        for (const file of files) {
            try {
                const image = await prepareBackgroundImage(file);
                const id = ulid();
                await this.imageStore.save(id, image);
                added = id;
            } catch {
                failed++;
            }
        }
        await (this.libraryLoaded = this.reloadLibrary());
        if (added) {
            const background = this.settings.custom.background;
            this.updateCustom({
                background: background.pictureMode === 'slideshow'
                    ? {...background}
                    : {...background, imageId: added, pictureMode: 'single'},
            });
        }
        return failed;
    }

    /** Show one picture from the folder, stopping a slideshow. */
    showPicture(imageId: string): void {
        this.updateCustom({background: {...this.settings.custom.background, imageId, pictureMode: 'single'}});
    }

    /** Delete a picture from this device's folder for good. The only way a picture is removed. */
    async deletePicture(id: string): Promise<void> {
        await this.imageStore.remove(id);
        await (this.libraryLoaded = this.reloadLibrary());
        const ids = this.pictureIdsSubject.value;
        const background = this.settings.custom.background;
        this.update({
            custom: {
                ...this.settings.custom,
                background: {
                    ...background,
                    imageId: background.imageId === id ? ids[ids.length - 1] ?? null : background.imageId,
                    pictureMode: ids.length ? background.pictureMode : 'none',
                },
            },
        });
    }

    loadPicture(id: string): Promise<Blob | null> {
        return this.imageStore.load(id);
    }

    /** None hides the picture without forgetting it; a slideshow starts from its first picture. */
    setPictureMode(pictureMode: BackgroundPictureMode): void {
        const background = this.settings.custom.background;
        const ids = this.pictureIdsSubject.value;
        this.updateCustom({
            background: {
                ...background,
                pictureMode,
                imageId: background.imageId ?? ids[ids.length - 1] ?? null,
                slideshowSince: pictureMode === 'slideshow' ? Date.now() : background.slideshowSince,
            },
        });
    }

    setSlideshowInterval(slideshowMinutes: number): void {
        if (!SLIDESHOW_INTERVALS.some(option => option.minutes === slideshowMinutes)) {
            return;
        }
        this.updateCustom({
            background: {...this.settings.custom.background, slideshowMinutes, slideshowSince: Date.now()},
        });
    }

    setSlideshowShuffle(slideshowShuffle: boolean): void {
        this.updateCustom({
            background: {...this.settings.custom.background, slideshowShuffle, slideshowSince: Date.now()},
        });
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
        this.setSavedColors(kept);
    }

    removeColor(color: string): void {
        const normalized = normalizeColor(color);
        if (!normalized) {
            return;
        }
        this.setSavedColors(this.savedColors.filter(saved => saved !== normalized));
    }

    /** The colours share the theme's timestamp, so the newest device wins for both at once. */
    private setSavedColors(colors: string[]): void {
        this.savedColorsSubject.next(colors);
        this.writeSavedColors(colors);
        const settings = {...this.settings, updatedAt: Date.now()};
        this.settingsSubject.next(settings);
        this.writeLocal(settings);
        this.queueSync(settings);
    }

    /** The palette the custom theme renders, so the editor can show the colours it ends up with. */
    customVariables(custom: CustomTheme): CssVariables {
        return buildThemeVariables(
            custom.seed,
            this.schemeFor(custom, custom.background),
            custom.background,
            this.templateVariables(custom),
            custom.shade,
        );
    }

    /**
     * Which base palette the theme builds on. A page with a colour of its own decides by how
     * light it is, so a dark page always gets light text, dark surfaces and course colours
     * made for it. A page derived from the primary colour follows the shade it was asked for.
     */
    private schemeFor(custom: CustomTheme, background: ThemeBackground): ColorScheme {
        const page = background.color
            ?? (custom.shade === 'fill' ? custom.seed.surfaceTint ?? custom.seed.accent : null);
        if (!page) {
            return custom.shade === 'dark' ? 'dark' : 'light';
        }
        const parsed = parseColor(page);
        return parsed && readableOn(parsed) === BLACK ? 'light' : 'dark';
    }

    resetToDefault(): void {
        this.update(defaultThemeSettings());
    }

    /**
     * What "Restore default settings" means for the theme: plain light, with the default colours
     * and no picture on show. The pictures themselves stay in this device's folder.
     */
    restorePlainLight(): void {
        this.update({...defaultThemeSettings(), mode: 'light'});
    }

    /** Every colour change leaves the template behind, so the theme is kept as the reader set it. */
    private updateSeed(change: Partial<ThemeSeed>): void {
        const custom = this.settings.custom;
        this.updateCustom({
            templateId: OWN_COLOR_TEMPLATE_ID,
            seed: {...custom.seed, ...change, intensity: OWN_COLOR_INTENSITY},
        });
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
        void this.showBackgroundPicture(background, false);

        if (persist) {
            this.writeLocal(settings);
            this.queueSync(settings);
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

    private async reloadLibrary(): Promise<void> {
        this.pictureIdsSubject.next(await this.imageStore.keys());
    }

    /**
     * Put the right picture on the page for this background and time the slideshow's next
     * change. A later call supersedes an earlier one still loading, so a quick run of theme
     * edits cannot leave an older picture on show.
     */
    private async showBackgroundPicture(background: ThemeBackground, fade: boolean): Promise<void> {
        const ticket = ++this.pictureTicket;
        this.clearSlideshowTimer();
        document.body.classList.remove(BACKGROUND_FADING_CLASS);

        let imageId = background.pictureMode === 'single' ? background.imageId : null;
        if (background.pictureMode === 'slideshow') {
            await this.libraryLoaded;
            if (ticket !== this.pictureTicket) {
                return;
            }
            const next = slideshowPicture(this.pictureIdsSubject.value, background, Date.now());
            imageId = next.id;
            if (next.changesAt !== null) {
                this.slideshowTimer = window.setTimeout(
                    () => void this.showBackgroundPicture(this.resolve(this.settings).background, true),
                    Math.min(next.changesAt - Date.now(), MAX_TIMEOUT_MS),
                );
            }
        }
        if (imageId === this.shownPictureSubject.value && (imageId === null || this.objectUrl)) {
            return;
        }

        const image = imageId ? await this.imageStore.load(imageId) : null;
        if (ticket !== this.pictureTicket) {
            return;
        }
        const url = image ? URL.createObjectURL(image) : null;
        if (url && fade && this.objectUrl && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
            const decoder = new Image();
            decoder.src = url;
            await decoder.decode().catch(() => undefined);
            document.body.classList.add(BACKGROUND_FADING_CLASS);
            await new Promise(resolve => setTimeout(resolve, BACKGROUND_FADE_MS));
            if (ticket !== this.pictureTicket) {
                URL.revokeObjectURL(url);
                return;
            }
        }

        this.releaseObjectUrl();
        this.objectUrl = url;
        const root = document.documentElement;
        root.style.setProperty('--flick-background-image', url ? `url("${url}")` : 'none');
        document.body.classList.toggle(BACKGROUND_IMAGE_CLASS, !!url);
        document.body.classList.remove(BACKGROUND_FADING_CLASS);
        this.shownPictureSubject.next(url ? imageId : null);
        this.imageUrlSubject.next(url);
    }

    private clearSlideshowTimer(): void {
        if (this.slideshowTimer !== null) {
            clearTimeout(this.slideshowTimer);
            this.slideshowTimer = null;
        }
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
        this.sync.attach(uid);
        const stored = this.readLocal(uid);
        const adoptGuest = guestSettings && guestSettings.updatedAt > stored.updatedAt;
        this.savedColorsSubject.next(this.readSavedColors(uid));
        this.apply(adoptGuest ? guestSettings : stored, adoptGuest);
        void this.pullRemote(uid, !!adoptGuest);
    }

    /**
     * Adopt the theme another device set more recently. Pictures never travel, so whatever
     * this device shows, and how, stays in place.
     */
    private async pullRemote(uid: string, sending: boolean): Promise<void> {
        const remote = await this.sync.read();
        if (this.userId !== uid || !remote?.theme) {
            return;
        }
        const incoming = sanitizeSettings(remote.theme);
        if (incoming.updatedAt <= this.settings.updatedAt) {
            return;
        }
        const settings: ThemeSettings = {
            ...incoming,
            custom: {
                ...incoming.custom,
                background: {...incoming.custom.background, ...devicePicture(this.settings.custom.background)},
            },
        };
        const colors = (remote.theme as {colors?: unknown}).colors;
        if (Array.isArray(colors)) {
            const kept = sanitizeSavedColors(colors);
            this.savedColorsSubject.next(kept);
            this.writeSavedColors(kept);
        }
        this.apply(settings, false);
        this.writeLocal(settings);
        // A guest theme already on its way out is older than this one, so it must not land.
        if (sending) {
            this.queueSync(settings);
        }
    }

    /** Everything but the pictures, which are too large to send and stay where they were added. */
    private queueSync(settings: ThemeSettings): void {
        if (this.userId === GUEST_ID) {
            return;
        }
        const custom = settings.custom;
        this.sync.queue({
            theme: {
                ...settings,
                custom: {...custom, background: {...custom.background, ...devicePicture(DEFAULT_BACKGROUND)}},
                colors: this.savedColors,
            },
        }, true);
    }

    private detachUser(): void {
        this.sync.detach();
        this.userId = GUEST_ID;
        this.apply(this.readLocal(GUEST_ID), false);
        this.savedColorsSubject.next(this.readSavedColors(GUEST_ID));
    }

    private readSavedColors(uid: string): string[] {
        try {
            const raw = localStorage.getItem(SAVED_COLORS_KEY_PREFIX + uid);
            const parsed: unknown = raw ? JSON.parse(raw) : null;
            return Array.isArray(parsed) ? sanitizeSavedColors(parsed) : [];
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
