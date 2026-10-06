import {TestBed} from '@angular/core/testing';
import {PopoverController} from '@ionic/angular/standalone';
import {of} from 'rxjs';
import {PomodoroTimerComponent} from './pomodoro-timer.component';
import {PomodoroService, DEFAULT_DURATIONS} from '../pomodoro.service';

describe('PomodoroTimerComponent', () => {
    let component: PomodoroTimerComponent;
    let pomodoroService: jasmine.SpyObj<Pick<PomodoroService, 'updateDurations' | 'getDurations'>>;

    beforeEach(() => {
        pomodoroService = jasmine.createSpyObj('PomodoroService', ['updateDurations', 'getDurations']);
        pomodoroService.getDurations.and.returnValue({...DEFAULT_DURATIONS});
        (pomodoroService as unknown as {phaseNotification$: unknown}).phaseNotification$ = of();

        TestBed.configureTestingModule({
            providers: [
                PomodoroTimerComponent,
                {provide: PomodoroService, useValue: pomodoroService},
                {provide: PopoverController, useValue: {create: () => Promise.resolve({present: () => Promise.resolve()})}},
            ],
        });
        component = TestBed.inject(PomodoroTimerComponent);
        component.ngOnInit();
    });

    describe('onDurationChange', () => {
        it('updates the duration for a valid value', () => {
            component.onDurationChange('studyMinutes', {detail: {value: '30'}} as unknown as CustomEvent);

            expect(pomodoroService.updateDurations).toHaveBeenCalledWith({studyMinutes: 30});
        });

        it('ignores a non-numeric value', () => {
            component.onDurationChange('studyMinutes', {detail: {value: 'abc'}} as unknown as CustomEvent);

            expect(pomodoroService.updateDurations).not.toHaveBeenCalled();
        });

        it('ignores zero', () => {
            component.onDurationChange('studyMinutes', {detail: {value: '0'}} as unknown as CustomEvent);

            expect(pomodoroService.updateDurations).not.toHaveBeenCalled();
        });

        it('ignores a value over 120', () => {
            component.onDurationChange('studyMinutes', {detail: {value: '121'}} as unknown as CustomEvent);

            expect(pomodoroService.updateDurations).not.toHaveBeenCalled();
        });

        it('accepts the 120 boundary', () => {
            component.onDurationChange('breakMinutes', {detail: {value: '120'}} as unknown as CustomEvent);

            expect(pomodoroService.updateDurations).toHaveBeenCalledWith({breakMinutes: 120});
        });
    });

    describe('toggleCollapse', () => {
        it('re-reads current durations only when expanding', () => {
            pomodoroService.getDurations.calls.reset();
            component.isCollapsed = true;

            component.toggleCollapse();

            expect(component.isCollapsed).toBe(false);
            expect(pomodoroService.getDurations).toHaveBeenCalledTimes(1);

            pomodoroService.getDurations.calls.reset();
            component.toggleCollapse();

            expect(component.isCollapsed).toBe(true);
            expect(pomodoroService.getDurations).not.toHaveBeenCalled();
        });
    });
});
