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
        this.currentUserId = 'guest';
        this.clearTimerState('guest');
        this.loadPreferences('guest');
        this.resetToPhase(this.getStudyPhase());
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

        if (this.timerState.value === 'idle') {
            this.timeRemaining.next(this.getCurrentPhaseDuration());
            this.notifyPhase(this.currentPhase.value, true);
        }

        this.timerState.next('running');
        this.startTicking();
        this.saveTimerState();
    }

    /** Pause the timer */
    pause(): void {
        if (this.timerState.value !== 'running') {
            return;
        }
        this.timerState.next('paused');
        this.stopTicking();
        this.saveTimerState();
    }

    /** Resume the timer */
    resume(): void {
        if (this.timerState.value !== 'paused') {
            return;
        }
        this.timerState.next('running');
        this.startTicking();
    }

    /** Reset the timer to idle state */
    reset(): void {
        this.stopTicking();
        this.timerState.next('idle');
        this.studySessionsInCycle = 0;
        this.completedSessions.next(0);
        this.resetToPhase(this.getStudyPhase());
        this.clearTimerState(this.currentUserId);
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
        this.tickSubscription = interval(1000).subscribe(() => {
            const remaining = this.timeRemaining.value - 1;

            if (remaining <= 0) {
                this.timeRemaining.next(0);
                this.playNotificationSound();
                this.advancePhase();
                // Auto-start the next phase
                this.startTicking();
            } else {
                this.timeRemaining.next(remaining);
                // Persist every 5 seconds to avoid excessive localStorage writes
                if (remaining % 5 === 0) {
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

    /** Play a notification tone using Web Audio API */
    private playNotificationSound(): void {
        try {
            if (!this.audioContext) {
                this.audioContext = new AudioContext();
            }

            const now = this.audioContext.currentTime;

            // Two-tone chime (high-low sequence)
            const osc1 = this.audioContext.createOscillator();
            const osc2 = this.audioContext.createOscillator();
            const gain = this.audioContext.createGain();

            osc1.type = 'sine';
            osc2.type = 'sine';

            osc1.frequency.setValueAtTime(587.33, now); // D5
            osc2.frequency.setValueAtTime(880.00, now + 0.15); // A5

            gain.gain.setValueAtTime(0.2, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

            osc1.connect(gain);
            osc2.connect(gain);
            gain.connect(this.audioContext.destination);

            osc1.start(now);
            osc1.stop(now + 0.15);

            osc2.start(now + 0.15);
            osc2.stop(now + 0.6);
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
                    savedAt: Date.now(),
                }),
            );
        } catch {
            // Ignore storage errors
        }
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

            this.completedSessions.next(saved.completedSessions ?? 0);
            this.studySessionsInCycle = saved.studySessionsInCycle ?? 0;
            this.currentPhase.next(phase);

            if (savedState === 'idle') {
                this.timeRemaining.next((this.durations[phase.durationKey] ?? DEFAULT_DURATIONS.studyMinutes) * 60);
                this.timerState.next('idle');
                return;
            }

            // Calculate how many seconds elapsed while page was closed
            const elapsedSeconds = savedState === 'running'
                ? Math.floor((Date.now() - (saved.savedAt ?? Date.now())) / 1000)
                : 0;

            let timeRemaining: number = (saved.timeRemaining ?? 0) - elapsedSeconds;

            // Handle case where one or more phases completed while page was away
            while (timeRemaining <= 0 && savedState === 'running') {
                // Advance phase silently (no notification for missed phases)
                if (phase.key === 'study') {
                    this.studySessionsInCycle++;
                    this.completedSessions.next(this.completedSessions.value + 1);
                    if (this.studySessionsInCycle >= this.sessionsBeforeLongBreak) {
                        this.studySessionsInCycle = 0;
                        this.currentPhase.next(this.getLongBreakPhase());
                    } else {
                        this.currentPhase.next(this.getBreakPhase());
                    }
                } else {
                    this.currentPhase.next(this.getStudyPhase());
                }
                const nextPhaseDuration = (this.durations[this.currentPhase.value.durationKey] ?? DEFAULT_DURATIONS.studyMinutes) * 60;
                timeRemaining += nextPhaseDuration;
            }

            this.timeRemaining.next(Math.max(0, timeRemaining));

            if (savedState === 'running') {
                this.timerState.next('running');
                this.startTicking();
            } else {
                // Restore paused state
                this.timerState.next('paused');
            }
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
