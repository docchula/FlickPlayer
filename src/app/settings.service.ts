import {DestroyRef, inject, Injectable} from '@angular/core';
import {NavigationEnd, Router} from '@angular/router';
import {BehaviorSubject, Observable} from 'rxjs';
import {distinctUntilChanged, filter, map} from 'rxjs/operators';
import {findFont, FONT_OPTIONS, fontHref, previewHref} from './settings/fonts';
import {defaultSettings, RESET_HOURS, WIDGETS} from './settings/settings-presets';
import {sanitizeSettings} from './settings/sanitize';
import {AppliedFont, AppSettings, FontOption, WidgetOption} from './settings/settings.model';

/** Settings stay on the device that set them, so the key carries no account id. */
export const SETTINGS_STORAGE_KEY = 'flickSettings';
/** Mirrors the resolved font so index.html can paint it before Angular boots. */
export const APPLIED_FONT_KEY = 'flickFontApplied';
/** Names the switched-off widgets for the rules in settings.scss. */
export const HIDDEN_ATTRIBUTE = 'data-hidden';

const FONT_LINK_PREFIX = 'flick-font-';
const PREVIEW_LINK_ID = 'flick-font-previews';

/**
 * The device's own preferences: which widgets to show, the font to read the app in, and when
 * a Pomodoro day rolls over. Deliberately never synced — a phone and a desktop are allowed to
 * differ, so nothing here is keyed by account or sent anywhere.
 */
@Injectable({
    providedIn: 'root',
})
export class SettingsService {
    readonly widgets = WIDGETS;
    readonly fonts = FONT_OPTIONS;
    readonly resetHours = RESET_HOURS;

    private readonly settingsSubject = new BehaviorSubject<AppSettings>(defaultSettings());

    readonly settings$: Observable<AppSettings> = this.settingsSubject.asObservable();
    readonly availableWidgets$: Observable<WidgetOption[]> = this.settings$.pipe(
        map(settings => WIDGETS.filter(widget => settings.seen.includes(widget.key))),
    );
    readonly font$: Observable<FontOption> = this.settings$.pipe(
        map(settings => findFont(settings.fontId)),
        distinctUntilChanged(),
    );
    readonly pomodoroResetHour$: Observable<number> = this.settings$.pipe(
        map(settings => settings.pomodoroResetHour),
        distinctUntilChanged(),
    );
    readonly pomodoroAvailable$: Observable<boolean> = this.available$('pomodoro');

    constructor() {
        this.apply(this.readLocal(), false);

        // Nothing has rendered yet, so the first look for widgets waits for the first page.
        const timer = setTimeout(() => this.probe());
        const subscription = inject(Router).events
            .pipe(filter(event => event instanceof NavigationEnd))
            .subscribe(() => setTimeout(() => this.probe()));
        inject(DestroyRef).onDestroy(() => {
            clearTimeout(timer);
            subscription.unsubscribe();
        });
    }

    get settings(): AppSettings {
        return this.settingsSubject.value;
    }

    isVisible(key: string): boolean {
        return !this.settings.hidden.includes(key);
    }

    /** Builds a new stream per call, so hold the result in a field rather than a template. */
    visible$(key: string): Observable<boolean> {
        return this.settings$.pipe(
            map(settings => !settings.hidden.includes(key)),
            distinctUntilChanged(),
        );
    }

    /** Whether this build turned out to contain the widget at all. */
    available$(key: string): Observable<boolean> {
        return this.settings$.pipe(
            map(settings => settings.seen.includes(key)),
            distinctUntilChanged(),
        );
    }

    setVisible(key: string, visible: boolean): void {
        const hidden = this.settings.hidden.filter(entry => entry !== key);
        if (!visible) {
            hidden.push(key);
        }
        this.update({hidden});
    }

    setFont(fontId: string): void {
        this.update({fontId: findFont(fontId).id});
    }

    setPomodoroResetHour(pomodoroResetHour: number): void {
        this.update({pomodoroResetHour});
    }

    readPomodoroDayKey(): string {
        return this.settings.pomodoroDayKey;
    }

    writePomodoroDayKey(pomodoroDayKey: string): void {
        this.update({pomodoroDayKey});
    }

    /** Draw the picker in the real faces, in one request small enough to be worth it. */
    loadFontPreviews(): void {
        this.ensureLink(PREVIEW_LINK_ID, previewHref());
    }

    /**
     * Look for the elements that prove a feature is in this build. A switched-off widget is
     * only hidden by CSS, so it stays in the page and stays discoverable — which is what lets
     * the user switch it back on.
     */
    probe(): void {
        const seen = [...this.settings.seen];
        for (const widget of WIDGETS) {
            const present = widget.selectors.some(selector => document.querySelector(selector));
            if (present && !seen.includes(widget.key)) {
                seen.push(widget.key);
            }
        }
        if (seen.length !== this.settings.seen.length) {
            this.update({seen});
        }
    }

    reset(): void {
        // What the app has discovered about itself is not a preference, so it survives.
        this.update({...defaultSettings(), seen: this.settings.seen});
    }

    private update(change: Partial<AppSettings>): void {
        this.apply({...this.settings, ...change}, true);
    }

    private apply(settings: AppSettings, persist: boolean): void {
        const root = document.documentElement;
        if (settings.hidden.length) {
            root.setAttribute(HIDDEN_ATTRIBUTE, settings.hidden.join(' '));
        } else {
            root.removeAttribute(HIDDEN_ATTRIBUTE);
        }

        this.applyFont(findFont(settings.fontId));
        this.settingsSubject.next(settings);

        if (persist) {
            this.writeLocal(settings);
        }
    }

    private applyFont(font: FontOption): void {
        const root = document.documentElement;
        if (font.stack) {
            root.style.setProperty('--ion-font-family', font.stack);
        } else {
            root.style.removeProperty('--ion-font-family');
        }
        root.style.setProperty('--flick-font-scale', String(font.scale ?? 1));

        const href = fontHref(font);
        if (href) {
            this.ensureLink(FONT_LINK_PREFIX + font.id, href);
        }
        this.writeAppliedFont({id: font.id, stack: font.stack, href, scale: font.scale ?? 1});
    }

    /** A face is fetched once and left in place, so switching back to it is instant. */
    private ensureLink(id: string, href: string): void {
        if (document.getElementById(id)) {
            return;
        }
        const link = document.createElement('link');
        link.id = id;
        link.rel = 'stylesheet';
        link.href = href;
        document.head.appendChild(link);
    }

    private readLocal(): AppSettings {
        try {
            const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);

            return sanitizeSettings(raw ? JSON.parse(raw) : null);
        } catch {
            return defaultSettings();
        }
    }

    private writeLocal(settings: AppSettings): void {
        try {
            localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
        } catch {
            // Storage may be unavailable; the settings still hold for this session.
        }
    }

    private writeAppliedFont(font: AppliedFont): void {
        try {
            localStorage.setItem(APPLIED_FONT_KEY, JSON.stringify(font));
        } catch {
            // Without the mirror the first paint falls back to the default font.
        }
    }
}
