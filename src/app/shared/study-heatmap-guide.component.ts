import {Component, inject} from '@angular/core';
import {AsyncPipe} from '@angular/common';
import {UserSyncService} from '../user-sync.service';

/** Plain-language explanation of the heatmap, shown from the card header. */
@Component({
    selector: 'app-study-heatmap-guide',
    templateUrl: './study-heatmap-guide.component.html',
    styleUrls: ['./study-heatmap-guide.component.scss'],
    imports: [AsyncPipe],
})
export class StudyHeatmapGuideComponent {
    protected readonly synced$ = inject(UserSyncService).active$;
    protected readonly storageWhenSynced =
        'Your calendar belongs to your account, so every device you sign in on adds up together.';
    protected readonly storageWhenLocal =
        'Your calendar is kept on the device you study on, so a phone and a laptop each keep their own.';
    title = 'Your study calendar';
    summary = 'Every small square is one day. The more you studied that day, the stronger its colour.';
    points = [
        {
            text: 'It fills itself in.',
            detail: 'Time counts while you watch a lecture here, or while the Pomodoro timer is running.',
        },
        {
            text: 'Left to right is time.',
            detail: 'Each column is one week and this week is on the right, so recent weeks are nearest the end.',
        },
        {
            text: 'A streak is days in a row.',
            detail: 'Study today to keep it going. Missing today only breaks it once the day is over.',
        },
        {
            text: 'Point at a square for the detail.',
            detail: 'It shows the date and how long you studied.',
        },
    ];
}
