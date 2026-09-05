import {Component, inject, OnDestroy, OnInit} from '@angular/core';
import {
    IonButton,
    IonCard,
    IonCardContent,
    IonCardHeader,
    IonCardTitle,
    IonIcon,
    IonInput,
    IonLabel,
    IonSegment,
    IonSegmentButton,
    PopoverController,
} from '@ionic/angular/standalone';
import {
    PomodoroService,
    DURATION_FIELDS,
    DurationField,
    PomodoroDurations,
    SESSION_MODES,
    SessionMode,
    SessionModeOption,
    DEFAULT_SESSION_MODE,
} from '../pomodoro.service';
import {PomodoroToast} from './pomodoro-toast';
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
import {Subscription} from 'rxjs';

/**
 * Info popover explaining the Pomodoro technique.
 */
@Component({
    selector: 'app-pomodoro-info-popover',
    template: `
        <div class="pomodoro-info-popover">
            <h3>{{ title }}</h3>
            <p>{{ description }}</p>
            <ol>
                @for (step of steps; track step.text) {
                    <li>{{ step.text }}<br><span class="step-detail">{{ step.detail }}</span></li>
                }
            </ol>
        </div>
    `,
    styles: [`
        .pomodoro-info-popover {
            padding: 1rem;
            max-width: 300px;
        }

        .pomodoro-info-popover h3 {
            margin: 0 0 0.5rem 0;
            font-weight: 700;
            color: var(--ion-text-color);
        }

        .pomodoro-info-popover p,
        .pomodoro-info-popover li {
            font-size: 0.85rem;
            color: var(--ion-color-medium);
            line-height: 1.4;
        }

        .pomodoro-info-popover ol {
            padding-left: 1.25rem;
            margin: 0.5rem 0 0 0;
        }

        .step-detail {
            color: var(--ion-color-medium-tint);
        }
    `],
    imports: [],
})
export class PomodoroInfoPopoverComponent {
    title = 'Pomodoro Technique';
    description = 'A time management method that uses a timer to break work into intervals:';
    steps = [
        { text: 'Study for the set duration', detail: '(default 25 min)' },
        { text: 'Take a short break', detail: '(default 5 min)' },
        { text: 'Repeat \u2014 after 4 study sessions, take a long break', detail: '(default 20 min)' },
    ];
}

/**
 * Collapsible Pomodoro Timer widget with fullscreen notification overlay.
 */
@Component({
    selector: 'app-pomodoro-timer',
    template: `
        <!--
          The phase notification is not rendered here. PomodoroToast attaches it to document.body,
          or to the fullscreen element while one is active, because .ion-page sets "contain: layout"
          and so becomes the containing block for position:fixed descendants — a toast rendered in
          this component is positioned against the page box instead of the viewport.
        -->
        <ion-card class="pomodoro-card">
            <ion-card-header class="pomodoro-header" (click)="toggleCollapse()" button>
                <ion-card-title class="pomodoro-title">
                    Pomodoro Timer
                    <ion-icon [name]="isCollapsed ? 'chevron-down' : 'chevron-up'" class="collapse-icon"></ion-icon>
                </ion-card-title>
            </ion-card-header>

            @if (!isCollapsed) {
                <ion-card-content class="pomodoro-content">
                    <!-- Timer Display -->
                    <div class="timer-section">
                        <div class="timer-label">
                            <span class="phase-label">{{ (pomodoroService.currentPhase$ | async)?.label ?? 'Timer' }}</span>
                            <ion-button fill="clear" size="small" (click)="openInfoPopover($event)" class="info-btn">
                                <ion-icon name="information-circle-outline" slot="icon-only" color="medium"></ion-icon>
                            </ion-button>
                        </div>
                        <div class="timer-display">{{ pomodoroService.formattedTime$ | async }}</div>

                        <!-- Controls -->
                        <div class="timer-controls">
                            @if ((pomodoroService.timerState$ | async) === 'idle') {
                                <ion-button fill="clear" (click)="pomodoroService.start()" aria-label="Start timer">
                                    <ion-icon name="play" slot="icon-only" color="medium" size="large"></ion-icon>
                                </ion-button>
                            }
                            @if ((pomodoroService.timerState$ | async) === 'running') {
                                <ion-button fill="clear" (click)="pomodoroService.pause()" aria-label="Pause timer">
                                    <ion-icon name="pause" slot="icon-only" color="medium" size="large"></ion-icon>
                                </ion-button>
                            }
                            @if ((pomodoroService.timerState$ | async) === 'paused') {
                                <ion-button fill="clear" (click)="pomodoroService.resume()" aria-label="Resume timer">
                                    <ion-icon name="play" slot="icon-only" color="primary" size="large"></ion-icon>
                                </ion-button>
                            }
                            @if ((pomodoroService.timerState$ | async) !== 'idle') {
                                <ion-button fill="clear" (click)="pomodoroService.skipPhase()" aria-label="Skip phase">
                                    <ion-icon name="play-skip-forward" slot="icon-only" color="medium"></ion-icon>
                                </ion-button>
                                <ion-button fill="clear" (click)="pomodoroService.reset()" aria-label="Reset timer">
                                    <ion-icon name="stop" slot="icon-only" color="danger"></ion-icon>
                                </ion-button>
                            }
                        </div>

                        <!-- Session counter -->
                        @if ((pomodoroService.completedSessions$ | async)! > 0) {
                            <div class="session-counter">
                                Session {{ pomodoroService.completedSessions$ | async }} completed
                            </div>
                        }
                    </div>

                    <!-- Session mode -->
                    <div class="mode-section">
                        <ion-label class="mode-label">Session type</ion-label>
                        <ion-segment [value]="sessionMode" (ionChange)="onSessionModeChange($event)">
                            @for (mode of sessionModes; track mode.key) {
                                <ion-segment-button [value]="mode.key">
                                    <ion-label>{{ mode.label }}</ion-label>
                                </ion-segment-button>
                            }
                        </ion-segment>
                        <p class="mode-hint">{{ sessionModeHint }}</p>
                    </div>

                    <!-- Duration Inputs -->
                    <div class="duration-section">
                        @for (field of durationFields; track field.key) {
                            <div class="duration-field">
                                <ion-label class="duration-label">{{ field.label }}</ion-label>
                                <div class="duration-input-wrapper">
                                    <ion-input
                                        type="number"
                                        [value]="currentDurations[field.key]"
                                        (ionChange)="onDurationChange(field.key, $event)"
                                        [min]="1"
                                        [max]="120"
                                        class="duration-input"
                                        [disabled]="(pomodoroService.timerState$ | async) !== 'idle'"
                                    ></ion-input>
                                    <span class="duration-suffix">{{ field.suffix }}</span>
                                </div>
                            </div>
                        }
                    </div>
                </ion-card-content>
            }
        </ion-card>
    `,
    styles: [`
        :host {
            display: block;
            width: 100%;
        }

        .pomodoro-card {
            margin: 0.75rem 0 0 0;
            border-radius: 0.75rem;
            overflow: hidden;
            box-shadow: var(--flick-welcome-card-shadow, 0 4px 16px rgba(0, 0, 0, 0.08));
        }

        .pomodoro-header {
            cursor: pointer;
            padding: 0.75rem 1rem;
        }

        .pomodoro-title {
            display: flex;
            align-items: center;
            justify-content: space-between;
            font-size: 1rem;
            font-weight: 600;
        }

        .collapse-icon {
            font-size: 1.2rem;
            color: var(--ion-color-medium);
        }

        .pomodoro-content {
            padding: 0 1rem 1rem 1rem;
        }

        .timer-section {
            text-align: center;
            padding: 0.5rem 0 0.75rem 0;
        }

        .timer-label {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 0.25rem;
            margin-bottom: 0.25rem;
        }

        .phase-label {
            font-size: 1.25rem;
            font-weight: 700;
            color: var(--ion-text-color);
        }

        .info-btn {
            --padding-start: 0;
            --padding-end: 0;
            height: auto;
        }

        .timer-display {
            font-size: 2.25rem;
            font-weight: 300;
            font-variant-numeric: tabular-nums;
            letter-spacing: 0.05em;
            color: var(--ion-color-medium);
            margin: 0.25rem 0;
        }

        .timer-controls {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 0.25rem;
        }

        .session-counter {
            font-size: 0.8rem;
            color: var(--ion-color-medium);
            margin-top: 0.5rem;
        }

        .mode-section {
            border-top: 1px solid var(--ion-border-color, rgba(0, 0, 0, 0.1));
            padding-top: 0.75rem;
            margin-bottom: 0.75rem;
        }

        .mode-label {
            display: block;
            font-size: 0.85rem;
            color: var(--ion-color-medium);
            margin-bottom: 0.35rem;
        }

        .mode-section ion-segment-button {
            --padding-start: 0.25rem;
            --padding-end: 0.25rem;
            font-size: 0.8rem;
            text-transform: none;
            min-height: 2.25rem;
        }

        .mode-hint {
            margin: 0.4rem 0 0 0;
            font-size: 0.78rem;
            line-height: 1.35;
            color: var(--ion-color-medium);
        }

        .duration-section {
            border-top: 1px solid var(--ion-border-color, rgba(0, 0, 0, 0.1));
            padding-top: 0.75rem;
        }

        .duration-field {
            margin-bottom: 0.75rem;
        }

        .duration-label {
            display: block;
            font-size: 0.85rem;
            color: var(--ion-color-medium);
            margin-bottom: 0.25rem;
        }

        .duration-input-wrapper {
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }

        .duration-input {
            --padding-start: 0.75rem;
            --padding-end: 0.75rem;
            border: 1px solid var(--ion-border-color, rgba(0, 0, 0, 0.15));
            border-radius: 0.5rem;
            max-width: 180px;
        }

        .duration-suffix {
            font-size: 0.9rem;
            color: var(--ion-color-medium);
        }

        /* The phase-notification toast lives outside this component's view (see template note),
           so its styles are global — see .pomodoro-toast in global.scss. */
    `],
    imports: [
        IonCard,
        IonCardHeader,
        IonCardTitle,
        IonCardContent,
        IonButton,
        IonIcon,
        IonInput,
        IonLabel,
        IonSegment,
        IonSegmentButton,
        AsyncPipe,
        FormsModule,
    ],
})
export class PomodoroTimerComponent implements OnInit, OnDestroy {
    pomodoroService = inject(PomodoroService);
    private popoverCtrl = inject(PopoverController);

    durationFields: DurationField[] = DURATION_FIELDS;
    currentDurations: PomodoroDurations;

    sessionModes: SessionModeOption[] = SESSION_MODES;
    sessionMode: SessionMode = DEFAULT_SESSION_MODE;

    isCollapsed = true;

    private notificationSub: Subscription | null = null;
    private toast: PomodoroToast | null = null;

    constructor() {
        addIcons({play, pause, stop, playSkipForward, chevronDown, chevronUp, informationCircleOutline, notificationsOutline});
    }

    get sessionModeHint(): string {
        return this.sessionModes.find(mode => mode.key === this.sessionMode)?.hint ?? '';
    }

    ngOnInit(): void {
        this.currentDurations = this.pomodoroService.getDurations();
        this.sessionMode = this.pomodoroService.getSessionMode();
        this.toast = new PomodoroToast();

        // Listen for phase notifications and display in-app toast
        this.notificationSub = this.pomodoroService.phaseNotification$.subscribe(notif => {
            this.toast?.show(notif.title, notif.body);
        });
    }

    ngOnDestroy(): void {
        this.notificationSub?.unsubscribe();
        this.toast?.destroy();
        this.toast = null;
    }

    toggleCollapse(): void {
        this.isCollapsed = !this.isCollapsed;
        if (!this.isCollapsed) {
            this.currentDurations = this.pomodoroService.getDurations();
        }
    }

    onSessionModeChange(event: CustomEvent<{value?: string | number}>): void {
        const selected = this.sessionModes.find(mode => mode.key === event.detail.value);
        if (selected) {
            this.sessionMode = selected.key;
            this.pomodoroService.setSessionMode(selected.key);
        }
    }

    onDurationChange(key: keyof PomodoroDurations, event: any): void {
        const value = parseInt(event.detail.value, 10);
        if (!isNaN(value) && value > 0 && value <= 120) {
            this.currentDurations = {...this.currentDurations, [key]: value};
            this.pomodoroService.updateDurations({[key]: value});
        }
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
