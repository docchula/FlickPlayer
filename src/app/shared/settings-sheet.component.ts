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
    IonSelect,
    IonSelectOption,
    IonTitle,
    IonToggle,
    IonToolbar,
    ModalController,
} from '@ionic/angular/standalone';
import {addIcons} from 'ionicons';
import {
    calendarOutline,
    checkmark,
    close,
    colorPaletteOutline,
    timerOutline,
} from 'ionicons/icons';
import {SettingsService} from '../settings.service';
import {FONT_SAMPLE} from '../settings/fonts';
import {AppSettings, FontOption} from '../settings/settings.model';

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
        IonSelect,
        IonSelectOption,
        AsyncPipe,
    ],
})
export class SettingsSheetComponent {
    protected settingsService = inject(SettingsService);
    private modalCtrl = inject(ModalController);

    protected readonly settings$ = this.settingsService.settings$;
    protected readonly availableWidgets$ = this.settingsService.availableWidgets$;
    protected readonly pomodoroAvailable$ = this.settingsService.pomodoroAvailable$;
    protected readonly sample = FONT_SAMPLE;

    constructor() {
        addIcons({close, checkmark, timerOutline, calendarOutline, colorPaletteOutline});

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

    selectFont(font: FontOption): void {
        this.settingsService.setFont(font.id);
    }

    onResetHourChange(event: Event): void {
        this.settingsService.setPomodoroResetHour(detailValue<number>(event));
    }

    reset(): void {
        this.settingsService.reset();
    }
}
