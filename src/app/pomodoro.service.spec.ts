import {TestBed, fakeAsync, discardPeriodicTasks} from '@angular/core/testing';
import {Analytics} from '@angular/fire/analytics';
import {
    PomodoroPreferences,
    PomodoroService,
    DEFAULT_DURATIONS,
    DEFAULT_SESSIONS_BEFORE_LONG_BREAK
} from './pomodoro.service';
import {SETTINGS_STORAGE_KEY, SettingsService} from './settings.service';
import {PomodoroSessionModeService} from './pomodoro-session-mode.service';

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
        localStorage.removeItem('flickPomodoroSessionMode');
        service = createService();
    });

    afterEach(() => {
        localStorage.removeItem('pomodoroPrefs_guest');
        localStorage.removeItem('pomodoroTimer_guest');
        localStorage.removeItem('flickPomodoroSessionMode');
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

    it('restoreTimerState() brings a timer closed mid-phase back paused where it stopped', fakeAsync(() => {
        localStorage.setItem('pomodoroTimer_guest', JSON.stringify({
            timerState: 'running',
            timeRemaining: 100,
            currentPhaseKey: 'study',
            completedSessions: 0,
            studySessionsInCycle: 0,
            savedAt: Date.now() - 30000
        }));

        service = createService();

        expect(firstValue(service.timerState$)).toBe('paused');
        expect(firstValue(service.timeRemaining$)).toBe(100);
        expect(firstValue(service.currentPhase$).key).toBe('study');

        discardPeriodicTasks();
    }));

    it('restoreTimerState() does not count the time the page was closed, however long', fakeAsync(() => {
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
        expect(firstValue(service.completedSessions$)).toBe(0);
        expect(firstValue(service.timeRemaining$)).toBe(10);
        expect(firstValue(service.timerState$)).toBe('paused');

        discardPeriodicTasks();
    }));

    it('pauses on leaving the tab only in the mode chosen for Flick only', () => {
        const hidden = spyOnProperty(document, 'hidden').and.returnValue(true);
        service.start();
        document.dispatchEvent(new Event('visibilitychange'));
        expect(firstValue(service.timerState$)).toBe('paused');

        hidden.and.returnValue(false);
        document.dispatchEvent(new Event('visibilitychange'));
        expect(firstValue(service.timerState$)).toBe('running');

        TestBed.inject(PomodoroSessionModeService).setMode('elsewhere');
        hidden.and.returnValue(true);
        document.dispatchEvent(new Event('visibilitychange'));
        expect(firstValue(service.timerState$)).toBe('running');

        service.reset();
    });

    it('pauses a running timer when the Pomodoro is switched off in settings', () => {
        const settings = TestBed.inject(SettingsService);
        settings.setVisible('pomodoro', true);
        service.start();

        settings.setVisible('pomodoro', false);
        expect(firstValue(service.timerState$)).toBe('paused');

        service.reset();
        settings.setVisible('pomodoro', true);
        localStorage.removeItem(SETTINGS_STORAGE_KEY);
    });

    describe('preferences shared across devices', () => {
        it('reports each change the reader makes, but not preferences applied from another device', () => {
            const changes: PomodoroPreferences[] = [];
            service.preferencesChanged$.subscribe(preferences => changes.push(preferences));

            service.updateDurations({studyMinutes: 50});
            service.setSessionsBeforeLongBreak(3);
            service.applyPreferences({sessionsBeforeLongBreak: 2});

            expect(changes.length).toBe(2);
            expect(changes[1]).toEqual({durations: {...DEFAULT_DURATIONS, studyMinutes: 50}, sessionsBeforeLongBreak: 3});
        });

        it('applies and saves valid preferences from another device, ignoring invalid values', () => {
            service.applyPreferences({durations: {studyMinutes: 45, breakMinutes: -1, longBreakMinutes: 'x'}, sessionsBeforeLongBreak: 6});

            const expected = {durations: {...DEFAULT_DURATIONS, studyMinutes: 45}, sessionsBeforeLongBreak: 6};
            expect(service.getPreferences()).toEqual(expected);
            expect(JSON.parse(localStorage.getItem('pomodoroPrefs_guest') ?? '')).toEqual(expected);
            expect(firstValue(service.timeRemaining$)).toBe(45 * 60);
        });
    });
});
