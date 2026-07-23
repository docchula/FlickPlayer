import {Injectable} from '@angular/core';
import {BehaviorSubject, Observable} from 'rxjs';
import {map} from 'rxjs/operators';

/** The user-selectable theme modes */
export type ThemeMode = 'light' | 'dark' | 'pink' | 'device';

/** Config entry for each theme option (used by the dropdown component) */
export interface ThemeOption {
    mode: ThemeMode;
    label: string;
    icon: string;
    iconColor: string;
}

/** All available theme options — single source of truth for the dropdown */
export const THEME_OPTIONS: ThemeOption[] = [
    {mode: 'light', label: 'Light theme', icon: 'sunny', iconColor: 'warning'},
    {mode: 'dark', label: 'Dark theme', icon: 'moon', iconColor: 'medium'},
    {mode: 'pink', label: 'Pink theme', icon: 'heart', iconColor: 'danger'},
    {mode: 'device', label: 'Device default', icon: 'phone-portrait', iconColor: 'medium'},
];

@Injectable({
    providedIn: 'root',
})
export class ThemeService {
    private readonly STORAGE_KEY_PREFIX = 'themePrefs_';
    private currentUserId = 'guest';

    private themeMode = new BehaviorSubject<ThemeMode>('device');

    /** Observable: the user-selected theme mode */
    currentTheme$ = this.themeMode.asObservable();

    /** Observable: the resolved effective theme (device → actual light/dark) */
    effectiveTheme$: Observable<'light' | 'dark' | 'pink'> = this.themeMode.pipe(
        map(mode => this.resolveEffective(mode)),
    );

    /** Backward-compatible observables for CSS class logic */
    isDarkMode$ = this.effectiveTheme$.pipe(map(t => t === 'dark'));
    isPinkMode$ = this.effectiveTheme$.pipe(map(t => t === 'pink'));

    private systemDarkMediaQuery: MediaQueryList | null = null;
    private systemDarkListener: ((e: MediaQueryListEvent) => void) | null = null;

    constructor() {
        this.setupSystemMediaListener();
        this.initTheme();
    }

    /** Set up listener for system dark mode changes */
    private setupSystemMediaListener(): void {
        if (typeof window !== 'undefined' && window.matchMedia) {
            this.systemDarkMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
            this.systemDarkListener = () => {
                // Re-apply theme if in device mode so CSS classes update
                if (this.themeMode.value === 'device') {
                    this.applyTheme();
                    // Re-emit so derived observables update
                    this.themeMode.next('device');
                }
            };
            this.systemDarkMediaQuery.addEventListener('change', this.systemDarkListener);
        }
    }

    /** Initialize theme for current state/guest */
    private initTheme(): void {
        const mode = this.loadPreference(this.currentUserId);
        this.themeMode.next(mode);
        this.applyTheme();
    }

    /** Load preferences for a specific user (call on login) */
    loadForUser(uid: string): void {
        this.currentUserId = uid || 'guest';
        const mode = this.loadPreference(this.currentUserId);
        this.themeMode.next(mode);
        this.applyTheme();
    }

    /** Clear preferences from active state (call on logout) */
    clearForUser(): void {
        this.currentUserId = 'guest';
        const mode = this.loadPreference('guest');
        this.themeMode.next(mode);
        this.applyTheme();
    }

    /** Set the active theme mode */
    setTheme(mode: ThemeMode): void {
        this.themeMode.next(mode);
        this.applyTheme();
        this.savePreference();
    }

    /** Synchronous getter for backward compatibility */
    get isDarkMode(): boolean {
        return this.resolveEffective(this.themeMode.value) === 'dark';
    }

    get isPinkMode(): boolean {
        return this.resolveEffective(this.themeMode.value) === 'pink';
    }

    get currentTheme(): ThemeMode {
        return this.themeMode.value;
    }

    /** Resolve 'device' to actual light/dark based on system preference */
    private resolveEffective(mode: ThemeMode): 'light' | 'dark' | 'pink' {
        if (mode === 'device') {
            const systemDark = this.systemDarkMediaQuery?.matches ?? false;
            return systemDark ? 'dark' : 'light';
        }
        return mode;
    }

    /** Load preference from localStorage with migration from old format */
    private loadPreference(uid: string): ThemeMode {
        try {
            const raw = localStorage.getItem(this.STORAGE_KEY_PREFIX + uid);
            if (raw) {
                const parsed = JSON.parse(raw);

                // New format: { theme: 'light' | 'dark' | 'pink' | 'device' }
                const validModes = THEME_OPTIONS.map(o => o.mode);
                if (typeof parsed.theme === 'string' && validModes.includes(parsed.theme as ThemeMode)) {
                    return parsed.theme as ThemeMode;
                }

                // Old format migration: { darkMode: boolean, pinkMode: boolean }
                if (typeof parsed.darkMode === 'boolean' || typeof parsed.pinkMode === 'boolean') {
                    if (parsed.pinkMode === true) {
                        return 'pink';
                    }
                    if (parsed.darkMode === true) {
                        return 'dark';
                    }
                    return 'light';
                }
            }
        } catch {
            // Ignore parse errors
        }

        // Default: follow device
        return 'device';
    }

    private savePreference(): void {
        localStorage.setItem(
            this.STORAGE_KEY_PREFIX + this.currentUserId,
            JSON.stringify({theme: this.themeMode.value}),
        );
    }

    private applyTheme(): void {
        const updateClasses = () => {
            const body = document.body;
            const effective = this.resolveEffective(this.themeMode.value);

            body.classList.toggle('dark-theme', effective === 'dark');
            body.classList.toggle('pink-theme', effective === 'pink');
        };

        if (typeof document !== 'undefined' && 'startViewTransition' in document) {
            (document as any).startViewTransition(() => {
                updateClasses();
            });
        } else {
            updateClasses();
        }
    }
}
