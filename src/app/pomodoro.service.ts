import {inject, Injectable} from '@angular/core';
import {BehaviorSubject, Observable, Subject, Subscription, interval} from 'rxjs';
import {map} from 'rxjs/operators';
import {Analytics, logEvent} from '@angular/fire/analytics';
import {ConsentService} from './consent.service';
import {PomodoroSessionModeService} from './pomodoro-session-mode.service';
import {SettingsService} from './settings.service';
import {nextResetAt, studyDayKey} from './settings/day';
import {PomodoroToast} from './shared/pomodoro-toast';

/** Pomodoro timer phase definitions */
export interface PomodoroPhase {
    key: string;
    label: string;
    durationKey: keyof PomodoroDurations;
    startMessage: string;
    endMessage: string;
}

/** Configurable durations (in minutes) */
export interface PomodoroDurations {
    studyMinutes: number;
    breakMinutes: number;
    longBreakMinutes: number;
}

/** The preferences that follow the user across devices (see PomodoroSyncService). */
export interface PomodoroPreferences {
    durations: PomodoroDurations;
    sessionsBeforeLongBreak: number;
}

/** Timer operational state */
export type TimerState = 'idle' | 'running' | 'paused';

/** All available phases — single source of truth */
export const POMODORO_PHASES: PomodoroPhase[] = [
    {
        key: 'study',
        label: 'Study',
        durationKey: 'studyMinutes',
        startMessage: 'Study session started! Focus on learning.',
        endMessage: 'Study session completed! Great job.',
    },
    {
        key: 'break',
        label: 'Break',
        durationKey: 'breakMinutes',
        startMessage: 'Break started! Take a short rest.',
        endMessage: 'Break finished! Time to get back to studying.',
    },
    {
        key: 'longBreak',
        label: 'Long Break',
        durationKey: 'longBreakMinutes',
        startMessage: 'Long break started! Enjoy a well-deserved rest.',
        endMessage: 'Long break finished! Ready for the next cycle.',
    },
];

/** Default durations */
export const DEFAULT_DURATIONS: PomodoroDurations = {
    studyMinutes: 25,
    breakMinutes: 5,
    longBreakMinutes: 20,
};

/** Default number of study sessions before a long break */
export const DEFAULT_SESSIONS_BEFORE_LONG_BREAK = 4;
export const MAX_SESSIONS_BEFORE_LONG_BREAK = 10;

/** Duration input field config — drives the UI form dynamically */
export interface DurationField {
    label: string;
    key: keyof PomodoroDurations;
    suffix: string;
}

export const DURATION_FIELDS: DurationField[] = [
    {label: 'Study Duration', key: 'studyMinutes', suffix: 'min'},
    {label: 'Break Duration', key: 'breakMinutes', suffix: 'min'},
    {label: 'Long Break Duration', key: 'longBreakMinutes', suffix: 'min'},
];

@Injectable({
    providedIn: 'root',
})
export class PomodoroService {
    private analytics = inject(Analytics);
    private consentService = inject(ConsentService);
    private sessionModes = inject(PomodoroSessionModeService);

    private readonly STORAGE_KEY_PREFIX = 'pomodoroPrefs_';
    private readonly TIMER_KEY_PREFIX = 'pomodoroTimer_';
    private currentUserId = 'guest';

    /** Configurable settings */
    private durations: PomodoroDurations = {...DEFAULT_DURATIONS};
    private sessionsBeforeLongBreak = new BehaviorSubject<number>(DEFAULT_SESSIONS_BEFORE_LONG_BREAK);
    private readonly preferencesChangedSubject = new Subject<PomodoroPreferences>();
    /** The preferences after each change the reader makes, but not after applyPreferences(). */
    readonly preferencesChanged$: Observable<PomodoroPreferences> = this.preferencesChangedSubject.asObservable();

    /** Internal state */
    private timerState = new BehaviorSubject<TimerState>('idle');
    private timeRemaining = new BehaviorSubject<number>(DEFAULT_DURATIONS.studyMinutes * 60);
    private currentPhase = new BehaviorSubject<PomodoroPhase>(POMODORO_PHASES[0]);
    private completedSessions = new BehaviorSubject<number>(0);
    private studySessionsInCycle = 0;

    /** The session count belongs to a day, and the day turns at an hour the reader picks. */
    private settingsService = inject(SettingsService);
    private resetHour = this.settingsService.settings.pomodoroResetHour;
    private nextDayAt = nextResetAt(Date.now(), this.resetHour);

    /** One toast for the whole app, so a timer card on each open page doesn't show it twice. */
    private toast: PomodoroToast | null = null;

    private tickSubscription: Subscription | null = null;
    private audioContext: AudioContext | null = null;
    /** Wall-clock epoch (ms) when the current running phase should end. Null while not running. */
    private phaseEndsAt: number | null = null;
    private lastSavedAt = 0;
    /**
     * True only while the timer is paused because the page was hidden. Distinguishes an automatic
     * pause (resume on return) from one the user asked for (stays paused until they say otherwise).
     */
    private pausedByVisibility = false;

    /** Public observables */
    timerState$: Observable<TimerState> = this.timerState.asObservable();
    timeRemaining$: Observable<number> = this.timeRemaining.asObservable();
    currentPhase$: Observable<PomodoroPhase> = this.currentPhase.asObservable();
    completedSessions$: Observable<number> = this.completedSessions.asObservable();
    sessionsBeforeLongBreak$: Observable<number> = this.sessionsBeforeLongBreak.asObservable();

    /** Formatted time string observable (HH:MM:SS) */
    formattedTime$: Observable<string> = this.timeRemaining$.pipe(
        map(seconds => this.formatTime(seconds)),
    );

    constructor() {
        this.loadPreferences(this.currentUserId);
        this.restoreTimerState(this.currentUserId);
        this.registerVisibilityHandlers();

        this.settingsService.pomodoroResetHour$.subscribe(hour => {
            this.resetHour = hour;
            this.nextDayAt = nextResetAt(Date.now(), hour);
            this.rollOverIfNewDay();
        });

        // The timer keeps running from the root injector whether or not the widget is on
        // screen, so switching it off has to stop it rather than merely hide it.
        this.settingsService.visible$('pomodoro').subscribe(visible => {
            if (!visible) {
                this.pause();
            }
        });
        // This timer acts on the choice, so the settings sheet can offer it.
        this.sessionModes.markSupported();
    }

    /** Request browser system notification permissions */
    requestNotificationPermission(): void {
        if (typeof window !== 'undefined' && 'Notification' in window) {
            if (Notification.permission === 'default') {
                Notification.requestPermission().catch(() => {});
            }
        }
    }

    /** Load preferences for a specific user (call on login) */
    loadForUser(uid: string): void {
        this.currentUserId = uid || 'guest';
        this.loadPreferences(this.currentUserId);
        this.restoreTimerState(this.currentUserId);
    }

    /** Clear preferences from active state (call on logout) */
    clearForUser(): void {
        this.stopTicking();
        this.timerState.next('idle');
        this.currentUserId = 'guest';
        this.clearTimerState('guest');
        this.loadPreferences('guest');
        this.resetToPhase(this.getStudyPhase());
        this.closeAudioContext();
    }

    /** Get current durations */
    getDurations(): PomodoroDurations {
        return {...this.durations};
    }

    /** How many study sessions earn a long break. A change applies to the cycle already under way. */
    setSessionsBeforeLongBreak(count: number): void {
        if (!Number.isInteger(count) || count < 1 || count > MAX_SESSIONS_BEFORE_LONG_BREAK
            || count === this.sessionsBeforeLongBreak.value) {
            return;
        }
        this.sessionsBeforeLongBreak.next(count);
        this.savePreferences();
        this.preferencesChangedSubject.next(this.getPreferences());
    }

    /** Update duration config and save */
    updateDurations(newDurations: Partial<PomodoroDurations>): void {
        this.durations = {...this.durations, ...newDurations};
        this.savePreferences();
        this.preferencesChangedSubject.next(this.getPreferences());

        // If idle, reset timer to reflect new duration
        if (this.timerState.value === 'idle') {
            this.timeRemaining.next(this.getCurrentPhaseDuration());
        }
    }

    getPreferences(): PomodoroPreferences {
        return {durations: {...this.durations}, sessionsBeforeLongBreak: this.sessionsBeforeLongBreak.value};
    }

    /** Take on preferences saved on another device. Invalid values are ignored, as in local storage. */
    applyPreferences(value: unknown): void {
        this.readPreferences(value);
        this.savePreferences();
        if (this.timerState.value === 'idle') {
            this.timeRemaining.next(this.getCurrentPhaseDuration());
        }
    }

    /** Start or resume the timer */
    start(): void {
        if (this.timerState.value === 'running') {
            return;
        }

        this.requestNotificationPermission();
        // Create (or re-arm) the audio context while we're inside a user gesture, so the
        // later automatic phase-change chime is allowed to play under iOS's autoplay policy.
        this.ensureAudioContext();

        if (this.timerState.value === 'idle') {
            this.timeRemaining.next(this.getCurrentPhaseDuration());
            this.notifyPhase(this.currentPhase.value, true);
            if (this.consentService.current === 'granted') {
                logEvent(this.analytics, 'pomodoro_start', {phase: this.currentPhase.value.key});
            }
        }

        this.pausedByVisibility = false;
        this.startRunning();
    }

    /** Pause the timer */
    pause(): void {
        if (this.timerState.value !== 'running') {
            return;
        }
        // A deliberate pause by default; the visibility handler re-flags it when it was the one
        // pausing, so returning to the tab only resumes what the tab itself paused.
        this.pausedByVisibility = false;
        // Settle the countdown from the wall-clock anchor rather than trusting the last tick:
        // the tick can be up to a second stale, and more when the tab was throttled.
        if (this.phaseEndsAt !== null) {
            this.timeRemaining.next(Math.max(0, Math.round((this.phaseEndsAt - Date.now()) / 1000)));
        }
        this.timerState.next('paused');
        this.stopTicking();
        this.phaseEndsAt = null;
        this.saveTimerState();
    }

    /** Resume the timer */
    resume(): void {
        if (this.timerState.value !== 'paused') {
            return;
        }
        // Only reachable from a user gesture, which is what lets iOS unlock the audio context.
        this.ensureAudioContext();
        this.pausedByVisibility = false;
        this.startRunning();
    }

    /** Enter the running state and re-anchor the countdown. Shared by every resume path. */
    private startRunning(): void {
        this.timerState.next('running');
        this.startTicking();
        this.saveTimerState();
    }

    /** Reset the timer to idle state */
    reset(): void {
        this.stopTicking();
        this.timerState.next('idle');
        this.pausedByVisibility = false;
        this.studySessionsInCycle = 0;
        this.completedSessions.next(0);
        this.resetToPhase(this.getStudyPhase());
        this.clearTimerState(this.currentUserId);
        this.closeAudioContext();
    }

    /** Skip to the next phase */
    skipPhase(): void {
        this.stopTicking();
        this.advancePhase();
        if (this.timerState.value === 'running') {
            this.startTicking();
        }
    }

    /** Get the sessions before long break count */
    getSessionsBeforeLongBreak(): number {
        return this.sessionsBeforeLongBreak.value;
    }

    // ────────────────────────── Private methods ──────────────────────────

    /** Catch up on a day that turned while the app was closed or idle. */
    private rollOverIfNewDay(): void {
        const today = studyDayKey(Date.now(), this.resetHour);
        if (this.settingsService.readPomodoroDayKey() !== today) {
            this.rollOverDay();
        }
    }

    /**
     * Start the day's session count again. The running phase is left alone: crossing the
     * boundary mid-session should not throw away the sitting the reader is in.
     */
    private rollOverDay(): void {
        this.studySessionsInCycle = 0;
        this.completedSessions.next(0);
        this.nextDayAt = nextResetAt(Date.now(), this.resetHour);
        this.settingsService.writePomodoroDayKey(studyDayKey(Date.now(), this.resetHour));
        this.saveTimerState();
    }

    private getStudyPhase(): PomodoroPhase {
        return POMODORO_PHASES.find(p => p.key === 'study') ?? POMODORO_PHASES[0];
    }

    private getBreakPhase(): PomodoroPhase {
        return POMODORO_PHASES.find(p => p.key === 'break') ?? POMODORO_PHASES[1];
    }

    private getLongBreakPhase(): PomodoroPhase {
        return POMODORO_PHASES.find(p => p.key === 'longBreak') ?? POMODORO_PHASES[2];
    }

    private getCurrentPhaseDuration(): number {
        const phase = this.currentPhase.value;
        return (this.durations[phase.durationKey] ?? DEFAULT_DURATIONS.studyMinutes) * 60;
    }

    private resetToPhase(phase: PomodoroPhase): void {
        this.currentPhase.next(phase);
        this.timeRemaining.next((this.durations[phase.durationKey] ?? DEFAULT_DURATIONS.studyMinutes) * 60);
    }

    private startTicking(): void {
        this.stopTicking();
        // Anchor to wall-clock time rather than counting ticks: a plain "decrement once per interval"
        // counter drifts whenever the interval is throttled (e.g. iOS suspending timers for a
        // backgrounded tab), so the displayed time and the actual phase-end notification lag behind.
        this.phaseEndsAt = Date.now() + this.timeRemaining.value * 1000;
        this.tickSubscription = interval(1000).subscribe(() => {
            if (Date.now() >= this.nextDayAt) {
                this.rollOverDay();
            }

            const remaining = Math.round((this.phaseEndsAt! - Date.now()) / 1000);

            if (remaining <= 0) {
                this.timeRemaining.next(0);
                this.playNotificationSound();
                if (this.currentPhase.value.key !== 'study' && document.hidden) {
                    // Nobody is at the tab as the break ends. Wait for them rather than starting study
                    // time on their behalf, so a timer left running cannot count study nobody did.
                    this.stopTicking();
                    this.phaseEndsAt = null;
                    this.timerState.next('paused');
                    this.advancePhase(true);
                } else {
                    this.advancePhase();
                    // Auto-start the next phase
                    this.startTicking();
                }
            } else {
                this.timeRemaining.next(remaining);
                if (Date.now() - this.lastSavedAt >= 5000) {
                    this.saveTimerState();
                }
            }
        });
    }

    private stopTicking(): void {
        if (this.tickSubscription) {
            this.tickSubscription.unsubscribe();
            this.tickSubscription = null;
        }
    }

    /** Move to the next phase. While waiting for the user, announce the end of the old phase instead. */
    private advancePhase(waitingForUser = false): void {
        const previousPhase = this.currentPhase.value;

        if (previousPhase.key === 'study') {
            this.studySessionsInCycle++;
            this.completedSessions.next(this.completedSessions.value + 1);

            if (this.studySessionsInCycle >= this.sessionsBeforeLongBreak.value) {
                this.studySessionsInCycle = 0;
                this.resetToPhase(this.getLongBreakPhase());
            } else {
                this.resetToPhase(this.getBreakPhase());
            }
        } else {
            this.resetToPhase(this.getStudyPhase());
        }

        if (waitingForUser) {
            this.notifyPhase(previousPhase, false);
        } else {
            this.notifyPhase(this.currentPhase.value, true);
        }
        this.saveTimerState();
    }

    /** Send system notification and show the in-app toast */
    private notifyPhase(phase: PomodoroPhase, isStart: boolean): void {
        const title = `Pomodoro: ${phase.label}`;
        const body = isStart ? phase.startMessage : phase.endMessage;

        if (typeof document !== 'undefined') {
            this.toast ??= new PomodoroToast();
            this.toast.show(title, body);
        }

        // Trigger system desktop browser notification if allowed (works over Fullscreen apps)
        if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
            try {
                new Notification(title, {
                    body,
                    requireInteraction: false,
                });
            } catch {
                // Ignore errors on non-supported environments
            }
        }
    }

    /**
     * Create the shared audio context if needed, then immediately suspend it. Call this from inside a
     * user-gesture handler (start/resume) so iOS treats the context as unlocked — playNotificationSound()
     * can then resume() it later from a timer callback, which iOS otherwise blocks.
     *
     * The context is kept suspended (not closed) between chimes so it doesn't hold an active iOS audio
     * session for the lifetime of the page — that active session was observed to interrupt/reload the
     * concurrently playing lecture video.
     */
    private ensureAudioContext(): void {
        try {
            if (!this.audioContext) {
                this.audioContext = new AudioContext();
            }
            if (this.audioContext.state === 'running') {
                void this.audioContext.suspend();
            }
        } catch {
            // Web Audio unsupported in this environment
        }
    }

    private closeAudioContext(): void {
        if (this.audioContext) {
            try {
                void this.audioContext.close();
            } catch {
                // Ignore
            }
            this.audioContext = null;
        }
    }

    /** Play a notification tone using Web Audio API */
    private playNotificationSound(): void {
        // Create on demand if we never got a user gesture (e.g. a running timer restored on page
        // refresh). Browsers that require a gesture will simply refuse to resume() below, which is
        // handled — but where it's allowed, the chime still plays.
        if (!this.audioContext) {
            this.ensureAudioContext();
        }
        const ctx = this.audioContext;
        if (!ctx) {
            return;
        }
        try {
            void ctx.resume().then(() => {
                const now = ctx.currentTime;

                // Two-tone chime (high-low sequence)
                const osc1 = ctx.createOscillator();
                const osc2 = ctx.createOscillator();
                const gain = ctx.createGain();

                osc1.type = 'sine';
                osc2.type = 'sine';

                osc1.frequency.setValueAtTime(587.33, now); // D5
                osc2.frequency.setValueAtTime(880.00, now + 0.15); // A5

                gain.gain.setValueAtTime(0.2, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

                osc1.connect(gain);
                osc2.connect(gain);
                gain.connect(ctx.destination);

                osc1.start(now);
                osc1.stop(now + 0.15);

                osc2.start(now + 0.15);
                osc2.stop(now + 0.6);

                osc2.onended = () => {
                    if (ctx.state === 'running') {
                        void ctx.suspend();
                    }
                };
            }).catch(() => {
                // Autoplay policy refused to resume the context (no user gesture yet) — skip the chime.
            });
        } catch {
            // Silently fail if Web Audio is unsupported
        }
    }

    private formatTime(totalSeconds: number): string {
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        return [hours, minutes, seconds]
            .map(v => String(v).padStart(2, '0'))
            .join(':');
    }

    private loadPreferences(uid: string): void {
        try {
            const raw = localStorage.getItem(this.STORAGE_KEY_PREFIX + uid);
            if (raw) {
                this.readPreferences(JSON.parse(raw));
            }
        } catch {
            // Ignore parse errors
        }
    }

    private readPreferences(value: unknown): void {
        const parsed = (value ?? {}) as {durations?: Partial<Record<keyof PomodoroDurations, unknown>>, sessionsBeforeLongBreak?: unknown};
        if (parsed.durations) {
            for (const field of DURATION_FIELDS) {
                const minutes = parsed.durations[field.key];
                if (typeof minutes === 'number' && minutes > 0) {
                    this.durations[field.key] = minutes;
                }
            }
        }
        if (typeof parsed.sessionsBeforeLongBreak === 'number' && parsed.sessionsBeforeLongBreak > 0) {
            this.sessionsBeforeLongBreak.next(parsed.sessionsBeforeLongBreak);
        }
    }

    private savePreferences(): void {
        localStorage.setItem(
            this.STORAGE_KEY_PREFIX + this.currentUserId,
            JSON.stringify({
                durations: this.durations,
                sessionsBeforeLongBreak: this.sessionsBeforeLongBreak.value,
            }),
        );
    }

    /** Persist running timer state to localStorage — no server calls */
    private saveTimerState(): void {
        try {
            localStorage.setItem(
                this.TIMER_KEY_PREFIX + this.currentUserId,
                JSON.stringify({
                    timerState: this.timerState.value,
                    timeRemaining: this.timeRemaining.value,
                    currentPhaseKey: this.currentPhase.value.key,
                    completedSessions: this.completedSessions.value,
                    studySessionsInCycle: this.studySessionsInCycle,
                }),
            );
            this.lastSavedAt = Date.now();
        } catch {
            // Ignore storage errors
        }
    }

    /**
     * In the lecture session mode, pause a running timer whenever the page is hidden, so time spent
     * on another tab is not counted as study time, and resume it as soon as the page comes back. In
     * the elsewhere mode the timer keeps running, since the studying is happening on another site.
     *
     * Only a pause this handler caused is resumed automatically: if the user paused deliberately
     * before switching away, the timer is still theirs to restart. A tab that was closed rather than
     * hidden also stays paused, since pausedByVisibility does not survive the reload.
     *
     * This also covers the flush that a hidden/torn-down page needs, since pause() persists state —
     * a tab closed mid-phase still resumes from where it stopped rather than the last phase change.
     */
    private registerVisibilityHandlers(): void {
        if (typeof document === 'undefined') {
            return;
        }
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                if (this.sessionModes.mode === 'lecture' && this.timerState.value === 'running') {
                    this.pause();
                    this.pausedByVisibility = true;
                } else if (this.timerState.value !== 'idle') {
                    this.saveTimerState();
                }
            } else {
                // A tab left open across the reset hour won't have been ticking if it was idle or
                // paused, so re-check the rollover on the way back in.
                if (Date.now() >= this.nextDayAt) {
                    this.rollOverDay();
                }
                if (this.pausedByVisibility && this.timerState.value === 'paused') {
                    this.pausedByVisibility = false;
                    // Deliberately not touching the audio context here: this is not a user gesture,
                    // and creating one outside a gesture leaves it locked on iOS.
                    this.startRunning();
                }
            }
        });
        window.addEventListener('pagehide', () => {
            if (this.timerState.value !== 'idle') {
                this.saveTimerState();
            }
        });
    }

    /** Restore timer state from localStorage on page load */
    private restoreTimerState(uid: string): void {
        try {
            const raw = localStorage.getItem(this.TIMER_KEY_PREFIX + uid);
            if (!raw) {
                this.resetToPhase(this.getStudyPhase());
                return;
            }

            const saved = JSON.parse(raw);
            const savedState: TimerState = saved.timerState;
            const phase = POMODORO_PHASES.find(p => p.key === saved.currentPhaseKey) ?? POMODORO_PHASES[0];

            // A count from before the last reset is cleared by rollOverIfNewDay() once settings load.
            this.completedSessions.next(saved.completedSessions ?? 0);
            this.studySessionsInCycle = saved.studySessionsInCycle ?? 0;
            this.currentPhase.next(phase);

            if (savedState === 'idle') {
                this.timeRemaining.next((this.durations[phase.durationKey] ?? DEFAULT_DURATIONS.studyMinutes) * 60);
                this.timerState.next('idle');
                return;
            }

            // The timer only advances while the page is open, so time spent closed is not
            // counted. Come back paused where the page left off and let the user resume.
            this.timeRemaining.next(Math.max(0, saved.timeRemaining ?? 0));
            this.timerState.next('paused');
        } catch {
            // Fallback to fresh state on any error
            this.resetToPhase(this.getStudyPhase());
        }
    }

    /** Remove saved timer state (on reset or logout) */
    private clearTimerState(uid: string): void {
        try {
            localStorage.removeItem(this.TIMER_KEY_PREFIX + uid);
        } catch {
            // Ignore
        }
    }
}
