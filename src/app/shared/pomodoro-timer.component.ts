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
    PopoverController,
} from '@ionic/angular/standalone';
import {PomodoroService, DURATION_FIELDS, DurationField, PomodoroDurations, PhaseNotification} from '../pomodoro.service';
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
        <!-- Floating notification toast for in-app & video fullscreen mode -->
        @if (activeNotification) {
            <div class="pomodoro-toast-overlay">
                <ion-icon name="notifications-outline" class="toast-icon"></ion-icon>
                <div class="toast-text">
                    <strong>{{ activeNotification.title }}</strong>
                    <span>{{ activeNotification.body }}</span>
                </div>
            </div>
        }

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

        /* Fullscreen & Floating Toast Overlay */
        .pomodoro-toast-overlay {
            position: fixed;
            top: 4.5rem;
            left: 50%;
            transform: translateX(-50%);
            z-index: 999999;
            background: var(--ion-color-dark, #222428);
            color: var(--ion-color-dark-contrast, #ffffff);
            padding: 0.75rem 1.25rem;
            border-radius: 2rem;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.45);
            display: flex;
            align-items: center;
            gap: 0.75rem;
            animation: slideDownFade 0.4s cubic-bezier(0.16, 1, 0.3, 1);
            pointer-events: none;
            max-width: 90vw;
        }

        .toast-icon {
            font-size: 1.5rem;
            color: var(--ion-color-warning, #ffc409);
        }

        .toast-text {
            display: flex;
            flex-direction: column;
            font-size: 0.85rem;
            line-height: 1.3;
        }

        @keyframes slideDownFade {
            from {
                opacity: 0;
                transform: translate(-50%, -20px);
            }
            to {
                opacity: 1;
                transform: translate(-50%, 0);
            }
        }
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
        AsyncPipe,
        FormsModule,
    ],
})
export class PomodoroTimerComponent implements OnInit, OnDestroy {
    pomodoroService = inject(PomodoroService);
    private popoverCtrl = inject(PopoverController);

    durationFields: DurationField[] = DURATION_FIELDS;
    currentDurations: PomodoroDurations;

    isCollapsed = true;

    activeNotification: PhaseNotification | null = null;
    private notificationSub: Subscription | null = null;
    private toastTimer: any = null;

    constructor() {
        addIcons({play, pause, stop, playSkipForward, chevronDown, chevronUp, informationCircleOutline, notificationsOutline});
    }

    ngOnInit(): void {
        this.currentDurations = this.pomodoroService.getDurations();

        // Listen for phase notifications and display in-app toast
        this.notificationSub = this.pomodoroService.phaseNotification$.subscribe(notif => {
            this.showToast(notif);
        });
    }

    ngOnDestroy(): void {
        this.notificationSub?.unsubscribe();
        if (this.toastTimer) {
            clearTimeout(this.toastTimer);
        }
    }

    private showToast(notif: PhaseNotification): void {
        this.activeNotification = notif;
        if (this.toastTimer) {
            clearTimeout(this.toastTimer);
        }

        // Handle Fullscreen Video DOM Overlay (inject directly into active fullscreen element)
        const fullscreenEl = typeof document !== 'undefined'
            ? (document.fullscreenElement || (document as any).webkitFullscreenElement || (document as any).mozFullScreenElement)
            : null;

        if (fullscreenEl) {
            let fullscreenToast = fullscreenEl.querySelector('.pomodoro-fullscreen-toast') as HTMLElement;
            if (!fullscreenToast) {
                fullscreenToast = document.createElement('div');
                fullscreenToast.className = 'pomodoro-fullscreen-toast';
                fullscreenEl.appendChild(fullscreenToast);
            }
            fullscreenToast.textContent = `${notif.title}: ${notif.body}`;
            fullscreenToast.classList.add('show');

            setTimeout(() => {
                fullscreenToast?.classList.remove('show');
            }, 5000);
        }

        // Auto hide standard in-app toast after 5 seconds
        this.toastTimer = setTimeout(() => {
            this.activeNotification = null;
        }, 5000);
    }

    toggleCollapse(): void {
        this.isCollapsed = !this.isCollapsed;
        if (!this.isCollapsed) {
            this.currentDurations = this.pomodoroService.getDurations();
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
