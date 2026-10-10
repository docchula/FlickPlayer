import {Component, inject} from '@angular/core';
import {AsyncPipe} from '@angular/common';
import {
    IonButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonIcon,
    IonItem,
    IonLabel,
    IonList,
    IonSegment,
    IonSegmentButton,
    IonSelect,
    IonSelectOption,
    IonTitle,
    IonToggle,
    IonToolbar,
    ModalController,
} from '@ionic/angular';
import {addIcons} from 'ionicons';
import {
    calendarOutline,
    close,
    colorPaletteOutline,
    timerOutline,
} from 'ionicons/icons';
import {SettingsService} from '../settings.service';
import {RestoreDefaultsService} from '../restore-defaults.service';
import {PomodoroSessionModeService, SessionMode} from '../pomodoro-session-mode.service';
import {FONT_SAMPLE, fontOptionClass} from '../settings/fonts';
import {SESSION_MODE_OPTIONS} from '../settings/settings-presets';
import {AppSettings} from '../settings/settings.model';

/** Ionic hands its payload over in `detail`, which the DOM event types do not describe. */
function detailValue<T>(event: Event): T {
    return (event as CustomEvent<{value: T}>).detail.value;
}

function detailChecked(event: Event): boolean {
    return (event as CustomEvent<{checked: boolean}>).detail.checked;
}

@Component({
    selector: 'app-settings-sheet',
    templateUrl: './settings-sheet.component.html',
    styleUrls: ['./settings-sheet.component.scss'],
    imports: [
        IonHeader,
        IonToolbar,
        IonTitle,
        IonButtons,
        IonButton,
        IonIcon,
        IonContent,
        IonList,
        IonItem,
        IonLabel,
        IonToggle,
        IonSegment,
        IonSegmentButton,
        IonSelect,
        IonSelectOption,
        AsyncPipe,
    ],
})
export class SettingsSheetComponent {
    protected settingsService = inject(SettingsService);
    private restoreDefaults = inject(RestoreDefaultsService);
    private sessionModes = inject(PomodoroSessionModeService);
    private modalCtrl = inject(ModalController);

    protected readonly settings$ = this.settingsService.settings$;
    protected readonly availableWidgets$ = this.settingsService.availableWidgets$;
    protected readonly pomodoroAvailable$ = this.settingsService.pomodoroAvailable$;
    protected readonly font$ = this.settingsService.font$;
    protected readonly sample = FONT_SAMPLE;
    protected readonly fontOptionClass = fontOptionClass;
    protected readonly sessionModeOptions = SESSION_MODE_OPTIONS;
    protected readonly sessionMode$ = this.sessionModes.mode$;
    protected readonly sessionModeSupported$ = this.sessionModes.supported$;
    /** Menus open from the row's right edge towards the sheet, rather than out over its edge. */
    protected readonly popoverOptions = {side: 'bottom', alignment: 'end'};

    constructor() {
        addIcons({close, timerOutline, calendarOutline, colorPaletteOutline});

        // Opening the sheet is an explicit request to look at the fonts, so draw them properly,
        // and take the chance to notice any widget this build turned out to have.
        this.settingsService.loadFontPreviews();
        this.settingsService.probe();
    }

    close(): void {
        void this.modalCtrl.dismiss();
    }

    isVisible(settings: AppSettings, key: string): boolean {
        return !settings.hidden.includes(key);
    }

    onWidgetToggle(key: string, event: Event): void {
        this.settingsService.setVisible(key, detailChecked(event));
    }

    onFontChange(event: Event): void {
        this.settingsService.setFont(detailValue<string>(event));
    }

    onResetHourChange(event: Event): void {
        this.settingsService.setPomodoroResetHour(detailValue<number>(event));
    }

    onSessionModeChange(event: Event): void {
        const mode = this.sessionModeOptions.find(option => option.value === detailValue<SessionMode>(event));
        if (mode) {
            this.sessionModes.setMode(mode.value);
        }
    }

    sessionModeHint(mode: SessionMode | null): string {
        return this.sessionModeOptions.find(option => option.value === mode)?.hint ?? '';
    }

    /** Puts back this sheet's settings and anything else that listens, such as the theme. */
    reset(): void {
        this.restoreDefaults.restore();
    }
}
