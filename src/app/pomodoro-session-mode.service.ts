import {Injectable} from '@angular/core';
import {BehaviorSubject, Observable} from 'rxjs';

/** What the reader studies from, which decides whether leaving the tab pauses the Pomodoro timer. */
export type SessionMode = 'lecture' | 'elsewhere';

export const SESSION_MODES: SessionMode[] = ['lecture', 'elsewhere'];
export const DEFAULT_SESSION_MODE: SessionMode = 'lecture';

const MODE_KEY = 'flickPomodoroSessionMode';
const SUPPORTED_KEY = 'flickPomodoroSessionModeSupported';

function read(key: string): string | null {
    try {
        return localStorage.getItem(key);
    } catch {
        return null;
    }
}

function write(key: string, value: string): void {
    try {
        localStorage.setItem(key, value);
    } catch {
        // Storage may be unavailable; the choice still holds for this session.
    }
}

/**
 * Whether the Pomodoro timer pauses when the reader leaves the tab. The settings sheet offers
 * the choice and the timer acts on it; they meet here, so neither has to know whether the other
 * is in the build. Kept on the device, like the rest of the settings.
 */
@Injectable({
    providedIn: 'root',
})
export class PomodoroSessionModeService {
    private readonly modeSubject = new BehaviorSubject<SessionMode>(
        SESSION_MODES.find(mode => mode === read(MODE_KEY)) ?? DEFAULT_SESSION_MODE);
    readonly mode$: Observable<SessionMode> = this.modeSubject.asObservable();

    private readonly supportedSubject = new BehaviorSubject<boolean>(read(SUPPORTED_KEY) === 'true');
    /**
     * Whether a timer that can pause on leaving the tab has run on this device. Until one has,
     * the choice would change nothing, so the settings sheet leaves it out.
     */
    readonly supported$: Observable<boolean> = this.supportedSubject.asObservable();

    get mode(): SessionMode {
        return this.modeSubject.value;
    }

    setMode(mode: SessionMode): void {
        if (mode === this.modeSubject.value) {
            return;
        }
        this.modeSubject.next(mode);
        write(MODE_KEY, mode);
    }

    /** Called by a timer that acts on the choice. */
    markSupported(): void {
        if (this.supportedSubject.value) {
            return;
        }
        this.supportedSubject.next(true);
        write(SUPPORTED_KEY, 'true');
    }
}
