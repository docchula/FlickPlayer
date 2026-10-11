import {Component, inject} from '@angular/core';
import {
    IonButton,
    IonCard,
    IonCardContent,
    IonCardHeader,
    IonCardTitle,
    IonIcon,
    IonInput,
    IonLabel,
    PopoverController,
} from '@ionic/angular';
import {
    PomodoroService,
    DURATION_FIELDS,
    DurationField,
    PomodoroDurations,
    MAX_SESSIONS_BEFORE_LONG_BREAK,
} from '../pomodoro.service';
import {PomodoroInfoPopoverComponent} from './pomodoro-info-popover.component';
import {AsyncPipe} from '@angular/common';
import {addIcons} from 'ionicons';
import {
    play,
    pause,
    stop,
    playSkipForward,
    chevronDown,
    chevronUp,
    informationCircleOutline,
    notificationsOutline,
} from 'ionicons/icons';
import {FormsModule} from '@angular/forms';

/**
 * Collapsible Pomodoro Timer widget. Every copy shows the one timer in PomodoroService.
 */
@Component({
    selector: 'app-pomodoro-timer',
    templateUrl: './pomodoro-timer.component.html',
    styleUrls: ['./pomodoro-timer.component.scss'],
    imports: [
        IonCard,
        IonCardHeader,
        IonCardTitle,
        IonCardContent,
        IonButton,
        IonIcon,
        IonInput,
        IonLabel,
        AsyncPipe,
        FormsModule,
    ],
})
export class PomodoroTimerComponent {
    pomodoroService = inject(PomodoroService);
    private popoverCtrl = inject(PopoverController);

    durationFields: DurationField[] = DURATION_FIELDS;
    currentDurations: PomodoroDurations = this.pomodoroService.getDurations();
    readonly maxSessionsBeforeLongBreak = MAX_SESSIONS_BEFORE_LONG_BREAK;

    isCollapsed = true;

    constructor() {
        addIcons({play, pause, stop, playSkipForward, chevronDown, chevronUp, informationCircleOutline, notificationsOutline});
    }

    toggleCollapse(): void {
        this.isCollapsed = !this.isCollapsed;
        if (!this.isCollapsed) {
            this.currentDurations = this.pomodoroService.getDurations();
        }
    }

    onDurationChange(key: keyof PomodoroDurations, event: CustomEvent<{value?: string | null}>): void {
        const value = parseInt(event.detail.value ?? '', 10);
        if (!isNaN(value) && value > 0 && value <= 120) {
            this.currentDurations = {...this.currentDurations, [key]: value};
            this.pomodoroService.updateDurations({[key]: value});
        }
    }

    onSessionsBeforeLongBreakChange(event: CustomEvent<{value?: string | null}>): void {
        const value = parseInt(event.detail.value ?? '', 10);
        if (!isNaN(value)) {
            this.pomodoroService.setSessionsBeforeLongBreak(Math.min(Math.max(value, 1), this.maxSessionsBeforeLongBreak));
        }
        // Show the count actually in use when the entry was out of range or blank.
        (event.target as HTMLIonInputElement).value = this.pomodoroService.getSessionsBeforeLongBreak();
    }

    async openInfoPopover(event: Event): Promise<void> {
        const popover = await this.popoverCtrl.create({
            component: PomodoroInfoPopoverComponent,
            event,
            translucent: true,
            showBackdrop: false,
        });
        await popover.present();
    }
}
