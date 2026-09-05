import {TestBed, fakeAsync, discardPeriodicTasks} from '@angular/core/testing';
import {Analytics} from '@angular/fire/analytics';
import {
    PomodoroService,
    DEFAULT_DURATIONS,
    DEFAULT_SESSIONS_BEFORE_LONG_BREAK
} from './pomodoro.service';

describe('PomodoroService', () => {
    let service: PomodoroService;

    function createService(): PomodoroService {
        TestBed.resetTestingModule();
        TestBed.configureTestingModule({
            providers: [{provide: Analytics, useValue: {}}]
        });
        return TestBed.inject(PomodoroService);
    }

    function firstValue<T>(obs: {subscribe: (fn: (v: T) => void) => void}): T {
        let value!: T;
        obs.subscribe(v => { value = v; });
        return value;
    }

    beforeEach(() => {
        localStorage.removeItem('pomodoroPrefs_guest');
        localStorage.removeItem('pomodoroTimer_guest');
        service = createService();
    });

    afterEach(() => {
        localStorage.removeItem('pomodoroPrefs_guest');
        localStorage.removeItem('pomodoroTimer_guest');
    });

    it('formats the default study duration as HH:MM:SS', () => {
        expect(firstValue(service.formattedTime$)).toBe('00:25:00');
    });

    it('updateDurations() merges partial durations, persists them, and resets the idle timer', () => {
        service.updateDurations({studyMinutes: 10});

        expect(firstValue(service.timeRemaining$)).toBe(10 * 60);

        const stored = JSON.parse(localStorage.getItem('pomodoroPrefs_guest')!);
        expect(stored.durations.studyMinutes).toBe(10);
        expect(stored.durations.breakMinutes).toBe(DEFAULT_DURATIONS.breakMinutes);
    });

    it('cycles study -> break -> ... -> long break after the configured number of study sessions', () => {
        const totalSkips = 2 * DEFAULT_SESSIONS_BEFORE_LONG_BREAK - 1;
        for (let i = 0; i < totalSkips; i++) {
            service.skipPhase();
        }

        expect(firstValue(service.currentPhase$).key).toBe('longBreak');
        expect(firstValue(service.completedSessions$)).toBe(DEFAULT_SESSIONS_BEFORE_LONG_BREAK);
    });

    it('reset() returns to the study phase, zeroes sessions, and clears stored timer state', () => {
        service.skipPhase();
        service.skipPhase();

        service.reset();

        expect(firstValue(service.currentPhase$).key).toBe('study');
        expect(firstValue(service.completedSessions$)).toBe(0);
        expect(localStorage.getItem('pomodoroTimer_guest')).toBeNull();
    });

    it('restoreTimerState() subtracts elapsed time for a running timer resumed after a short gap', fakeAsync(() => {
        localStorage.setItem('pomodoroTimer_guest', JSON.stringify({
            timerState: 'running',
            timeRemaining: 100,
            currentPhaseKey: 'study',
            completedSessions: 2,
            studySessionsInCycle: 1,
            savedAt: Date.now() - 30000
        }));

        service = createService();

        const remaining = firstValue(service.timeRemaining$);
        expect(remaining).toBeGreaterThanOrEqual(69);
        expect(remaining).toBeLessThanOrEqual(70);
        expect(firstValue(service.currentPhase$).key).toBe('study');
        expect(firstValue(service.completedSessions$)).toBe(2);

        discardPeriodicTasks();
    }));

    it('restoreTimerState() rolls forward through completed phases after a long gap', fakeAsync(() => {
        // 700s gap from a 10s-remaining study phase: one full study->break->study
        // cycle completes (break is 300s), landing back in study with time to spare.
        localStorage.setItem('pomodoroTimer_guest', JSON.stringify({
            timerState: 'running',
            timeRemaining: 10,
            currentPhaseKey: 'study',
            completedSessions: 0,
            studySessionsInCycle: 0,
            savedAt: Date.now() - 700000
        }));

        service = createService();

        expect(firstValue(service.currentPhase$).key).toBe('study');
        expect(firstValue(service.completedSessions$)).toBe(1);
        const remaining = firstValue(service.timeRemaining$);
        expect(remaining).toBeGreaterThanOrEqual(1108);
        expect(remaining).toBeLessThanOrEqual(1110);

        discardPeriodicTasks();
    }));
});
