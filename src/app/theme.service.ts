import {DestroyRef, inject, Injectable} from '@angular/core';
import {BehaviorSubject, Observable} from 'rxjs';
import {distinctUntilChanged, map} from 'rxjs/operators';
import {ulid} from 'ulid';
import {AuthService} from './auth.service';
import {isValidColor} from './theme/color';
import {buildThemeVariables, CssVariables} from './theme/palette';
import {
    BACKGROUND_FIT_OPTIONS,
    DEFAULT_BACKGROUND,
    defaultCustomTheme,
    defaultThemeSettings,
    findTemplate,
    CUSTOM_SCHEME,
    NEUTRAL_SEED,
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
export const BACKGROUND_IMAGE_CLASS = 'flick-has-background-image';
const GUEST_ID = 'guest';

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
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
    readonly backgroundFitOptions = BACKGROUND_FIT_OPTIONS;

    private readonly settingsSubject = new BehaviorSubject<ThemeSettings>(defaultThemeSettings());
    private readonly schemeSubject = new BehaviorSubject<ColorScheme>('light');
    private readonly imageUrlSubject = new BehaviorSubject<string | null>(null);

    readonly settings$: Observable<ThemeSettings> = this.settingsSubject.asObservable();
    readonly scheme$: Observable<ColorScheme> = this.schemeSubject.asObservable();
    readonly backgroundImageUrl$: Observable<string | null> = this.imageUrlSubject.asObservable();
    readonly mode$: Observable<ThemeMode> = this.settings$.pipe(
        map(settings => settings.mode),
        distinctUntilChanged(),
    );
    readonly modeOption$: Observable<ThemeModeOption> = this.mode$.pipe(
        map(mode => this.modes.find(option => option.value === mode) ?? this.modes[0]),
    );

    private userId = GUEST_ID;
    private objectUrl: string | null = null;
    private darkQuery: MediaQueryList | null = null;

    constructor() {
        const destroyRef = inject(DestroyRef);
        this.darkQuery = window.matchMedia?.('(prefers-color-scheme: dark)') ?? null;
        const onSystemChange = () => this.apply(this.settingsSubject.value, false);
        this.darkQuery?.addEventListener('change', onSystemChange);
        destroyRef.onDestroy(() => {
            this.darkQuery?.removeEventListener('change', onSystemChange);
            this.releaseObjectUrl();
        });

        this.apply(this.readLocal(GUEST_ID), false);

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

    selectTemplate(templateId: string): void {
        const template = findTemplate(templateId);
        if (template) {
            this.updateCustom({
                templateId: template.id,
                seed: {...template.seed},
                background: {...this.settings.custom.background, color: template.background},
            });
        }
    }

    setAccent(accent: string): void {
        if (!isValidColor(accent)) {
            return;
        }
        this.updateCustom({
            templateId: OWN_COLOR_TEMPLATE_ID,
            seed: {
                accent,
                companion: null,
                tertiary: null,
                surfaceTint: null,
                intensity: OWN_COLOR_INTENSITY,
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

    resetCustom(): void {
        this.update({custom: defaultCustomTheme()});
    }

    /** Palette for a seed without applying it, used to preview a template in the picker. */
    preview(seed: ThemeSeed, scheme = this.scheme): CssVariables {
        return buildThemeVariables(seed, scheme, DEFAULT_BACKGROUND);
    }

    private updateCustom(change: Partial<CustomTheme>): void {
        this.update({mode: 'custom', custom: {...this.settings.custom, ...change}});
    }

    private update(change: Partial<ThemeSettings>): void {
        this.apply({...this.settings, ...change, updatedAt: Date.now()}, true);
    }

    /** The standard modes deliberately carry no colour, picture or background of their own. */
    private resolve(settings: ThemeSettings): {scheme: ColorScheme, seed: ThemeSeed, background: ThemeBackground} {
        if (settings.mode === 'custom') {
            return {
                scheme: CUSTOM_SCHEME,
                seed: settings.custom.seed,
                background: settings.custom.background,
            };
        }
        return {
            scheme: this.resolveScheme(settings.mode),
            seed: {...NEUTRAL_SEED},
            background: {...DEFAULT_BACKGROUND},
        };
    }

    private apply(settings: ThemeSettings, persist: boolean): void {
        const {scheme, seed, background} = this.resolve(settings);
        const variables = buildThemeVariables(seed, scheme, background);

        const root = document.documentElement;
        root.setAttribute('data-theme', scheme);
        for (const [name, value] of Object.entries(variables)) {
            root.style.setProperty(name, value);
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
    }

    private detachUser(): void {
        this.userId = GUEST_ID;
        this.apply(this.readLocal(GUEST_ID), false);
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
