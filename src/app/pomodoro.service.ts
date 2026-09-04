import {Injectable} from '@angular/core';
import {BehaviorSubject, Observable, Subject, Subscription, interval} from 'rxjs';
import {map} from 'rxjs/operators';

/** Pomodoro timer phase definitions */
export interface PomodoroPhase {
    key: string;
    label: string;
    durationKey: keyof PomodoroDurations;
    startMessage: string;
    endMessage: string;
}

/** Notification payload for phase transitions */
export interface PhaseNotification {
    title: string;
    body: string;
    phase: PomodoroPhase;
}

/** Configurable durations (in minutes) */
export interface PomodoroDurations {
    studyMinutes: number;
    breakMinutes: number;
    longBreakMinutes: number;
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
    private readonly STORAGE_KEY_PREFIX = 'pomodoroPrefs_';
    private readonly TIMER_KEY_PREFIX = 'pomodoroTimer_';
    /** Hour of the local day at which session progress rolls over to a new study day. */
    private readonly DAY_ROLLOVER_HOUR = 4;
    private currentUserId = 'guest';

    /** Configurable settings */
    private durations: PomodoroDurations = {...DEFAULT_DURATIONS};
    private sessionsBeforeLongBreak = DEFAULT_SESSIONS_BEFORE_LONG_BREAK;

    /** Internal state */
    private timerState = new BehaviorSubject<TimerState>('idle');
    private timeRemaining = new BehaviorSubject<number>(DEFAULT_DURATIONS.studyMinutes * 60);
    private currentPhase = new BehaviorSubject<PomodoroPhase>(POMODORO_PHASES[0]);
    private completedSessions = new BehaviorSubject<number>(0);
    private studySessionsInCycle = 0;

    /** Notification stream */
    private phaseNotificationSubject = new Subject<PhaseNotification>();
    phaseNotification$: Observable<PhaseNotification> = this.phaseNotificationSubject.asObservable();

    private tickSubscription: Subscription | null = null;
    private audioContext: AudioContext | null = null;
    /** Wall-clock epoch (ms) when the current running phase should end. Null while not running. */
    private phaseEndsAt: number | null = null;
    private lastSavedAt = 0;
    /** Study day the current session counts belong to; progress resets when this changes. */
    private studyDayKey = this.getStudyDayKey();
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
    sessionsBeforeLongBreak$: Observable<number> = new BehaviorSubject<number>(this.sessionsBeforeLongBreak).asObservable();

    /** Formatted time string observable (HH:MM:SS) */
    formattedTime$: Observable<string> = this.timeRemaining$.pipe(
        map(seconds => this.formatTime(seconds)),
    );

    constructor() {
        this.loadPreferences(this.currentUserId);
        this.restoreTimerState(this.currentUserId);
        this.registerVisibilityHandlers();
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

    /** Update duration config and save */
    updateDurations(newDurations: Partial<PomodoroDurations>): void {
        this.durations = {...this.durations, ...newDurations};
        this.savePreferences();

        // If idle, reset timer to reflect new duration
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
        return this.sessionsBeforeLongBreak;
    }

    // ────────────────────────── Private methods ──────────────────────────

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
            this.applyDayRolloverIfNeeded();
            const remaining = Math.round((this.phaseEndsAt! - Date.now()) / 1000);

            if (remaining <= 0) {
                this.timeRemaining.next(0);
                this.playNotificationSound();
                this.advancePhase();
                // Auto-start the next phase
                this.startTicking();
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

    private advancePhase(): void {
        const previousPhase = this.currentPhase.value;

        if (previousPhase.key === 'study') {
            this.studySessionsInCycle++;
            this.completedSessions.next(this.completedSessions.value + 1);

            if (this.studySessionsInCycle >= this.sessionsBeforeLongBreak) {
                this.studySessionsInCycle = 0;
                this.resetToPhase(this.getLongBreakPhase());
            } else {
                this.resetToPhase(this.getBreakPhase());
            }
        } else {
            this.resetToPhase(this.getStudyPhase());
        }

        const newPhase = this.currentPhase.value;
        this.notifyPhase(newPhase, true);
        this.saveTimerState();
    }

    /** Send system notification and emit in-app toast event */
    private notifyPhase(phase: PomodoroPhase, isStart: boolean): void {
        const title = `Pomodoro: ${phase.label}`;
        const body = isStart ? phase.startMessage : phase.endMessage;

        // Emit for in-app / in-fullscreen overlay toast
        this.phaseNotificationSubject.next({title, body, phase});

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
                const parsed = JSON.parse(raw);
                if (parsed.durations) {
                    for (const field of DURATION_FIELDS) {
                        if (typeof parsed.durations[field.key] === 'number' && parsed.durations[field.key] > 0) {
                            this.durations[field.key] = parsed.durations[field.key];
                        }
                    }
                }
                if (typeof parsed.sessionsBeforeLongBreak === 'number' && parsed.sessionsBeforeLongBreak > 0) {
                    this.sessionsBeforeLongBreak = parsed.sessionsBeforeLongBreak;
                }
            }
        } catch {
            // Ignore parse errors
        }
    }

    private savePreferences(): void {
        localStorage.setItem(
            this.STORAGE_KEY_PREFIX + this.currentUserId,
            JSON.stringify({
                durations: this.durations,
                sessionsBeforeLongBreak: this.sessionsBeforeLongBreak,
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
                    studyDayKey: this.studyDayKey,
                }),
            );
            this.lastSavedAt = Date.now();
        } catch {
            // Ignore storage errors
        }
    }

    /**
     * Pause a running timer whenever the page is hidden, so time spent on another tab (or with the
     * app backgrounded) is not counted as study time, and resume it as soon as the page comes back.
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
                if (this.timerState.value === 'running') {
                    this.pause();
                    this.pausedByVisibility = true;
                } else if (this.timerState.value !== 'idle') {
                    this.saveTimerState();
                }
            } else {
                // A tab left open across 4am won't have been ticking if it was idle or paused,
                // so re-check the rollover on the way back in.
                this.applyDayRolloverIfNeeded();
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

    /**
     * Local calendar day used for session progress, with the boundary at DAY_ROLLOVER_HOUR instead of
     * midnight — a session running at 2am still counts toward the previous day's progress.
     */
    private getStudyDayKey(now: Date = new Date()): string {
        const shifted = new Date(now.getTime() - this.DAY_ROLLOVER_HOUR * 60 * 60 * 1000);
        return `${shifted.getFullYear()}-${shifted.getMonth() + 1}-${shifted.getDate()}`;
    }

    /** Clear the day's session counts once the rollover hour has passed. */
    private applyDayRolloverIfNeeded(): void {
        const currentKey = this.getStudyDayKey();
        if (currentKey === this.studyDayKey) {
            return;
        }
        this.studyDayKey = currentKey;
        this.completedSessions.next(0);
        this.studySessionsInCycle = 0;
        this.saveTimerState();
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

            // Session counts belong to the study day they were earned on — a saved state from
            // before the last 4am rollover comes back with progress cleared.
            const isSameStudyDay = saved.studyDayKey === this.studyDayKey;
            this.completedSessions.next(isSameStudyDay ? (saved.completedSessions ?? 0) : 0);
            this.studySessionsInCycle = isSameStudyDay ? (saved.studySessionsInCycle ?? 0) : 0;
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
