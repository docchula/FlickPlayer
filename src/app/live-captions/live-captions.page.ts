import {Component, signal} from '@angular/core';
import {IonBackButton, IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonTitle, IonToolbar} from '@ionic/angular';
import {addIcons} from 'ionicons';
import {checkmarkOutline, copyOutline} from 'ionicons/icons';
import {CHROME_ACCESSIBILITY_SETTINGS, isGoogleChrome, liveCaptionComputer} from './live-captions';

@Component({
    selector: 'app-live-captions',
    templateUrl: './live-captions.page.html',
    styleUrls: ['./live-captions.page.scss'],
    imports: [IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonContent, IonButton, IonIcon],
})
export class LiveCaptionsPage {
    readonly settingsAddress = CHROME_ACCESSIBILITY_SETTINGS;
    readonly computer = liveCaptionComputer();
    readonly inChrome = isGoogleChrome();
    readonly keys = this.computer === 'macOS'
        ? {newTab: '⌘ + T', paste: '⌘ + V', go: 'Return'}
        : {newTab: 'Ctrl + T', paste: 'Ctrl + V', go: 'Enter'};
    /** Whether the address was copied, or null before the button is pressed. */
    readonly copied = signal<boolean | null>(null);

    constructor() {
        addIcons({copyOutline, checkmarkOutline});
    }

    async copyAddress() {
        try {
            await navigator.clipboard.writeText(this.settingsAddress);
            this.copied.set(true);
        } catch {
            this.copied.set(false);
        }
    }
}
