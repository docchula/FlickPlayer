import {Component, inject} from '@angular/core';
import {PomodoroService} from '../pomodoro.service';

/**
 * Info popover explaining the Pomodoro technique.
 */
@Component({
    selector: 'app-pomodoro-info-popover',
    templateUrl: './pomodoro-info-popover.component.html',
    styleUrls: ['./pomodoro-info-popover.component.scss'],
    imports: [],
})
export class PomodoroInfoPopoverComponent {
    private sessions = inject(PomodoroService).getSessionsBeforeLongBreak();
    title = 'Pomodoro Technique';
    description = 'A time management method that uses a timer to break work into intervals:';
    steps = [
        { text: 'Study for the set duration', detail: '(default 25 min)' },
        { text: 'Take a short break', detail: '(default 5 min)' },
        {
            text: `Repeat — after ${this.sessions} study session${this.sessions === 1 ? '' : 's'}, take a long break`,
            detail: '(default 20 min)',
        },
    ];
}
