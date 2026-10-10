import {TestBed} from '@angular/core/testing';
import {DEFAULT_SESSION_MODE, PomodoroSessionModeService} from './pomodoro-session-mode.service';

describe('PomodoroSessionModeService', () => {
    const keys = ['flickPomodoroSessionMode', 'flickPomodoroSessionModeSupported'];

    function create(): PomodoroSessionModeService {
        TestBed.resetTestingModule();
        return TestBed.inject(PomodoroSessionModeService);
    }

    beforeEach(() => keys.forEach(key => localStorage.removeItem(key)));
    afterEach(() => keys.forEach(key => localStorage.removeItem(key)));

    it('starts in the default mode', () => {
        expect(create().mode).toBe(DEFAULT_SESSION_MODE);
    });

    it('keeps the chosen mode across a reload', () => {
        create().setMode('elsewhere');
        expect(create().mode).toBe('elsewhere');
    });

    it('ignores a stored mode this build does not know', () => {
        localStorage.setItem('flickPomodoroSessionMode', 'sometimes');
        expect(create().mode).toBe(DEFAULT_SESSION_MODE);
    });

    it('stays unsupported until a timer says it can pause, then remembers that', () => {
        const service = create();
        let supported = true;
        service.supported$.subscribe(value => supported = value);
        expect(supported).toBeFalse();

        service.markSupported();
        expect(supported).toBeTrue();

        let afterReload = false;
        create().supported$.subscribe(value => afterReload = value);
        expect(afterReload).toBeTrue();
    });
});
