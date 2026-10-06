import {Component, inject} from '@angular/core';
import {IonButton, IonIcon, ModalController} from '@ionic/angular/standalone';
import {addIcons} from 'ionicons';
import {settingsOutline} from 'ionicons/icons';
import {SettingsSheetComponent} from './settings-sheet.component';

@Component({
    selector: 'app-settings-menu',
    templateUrl: './settings-menu.component.html',
    styleUrls: ['./settings-menu.component.scss'],
    imports: [IonButton, IonIcon],
})
export class SettingsMenuComponent {
    private modalCtrl = inject(ModalController);

    constructor() {
        addIcons({settingsOutline});
    }

    async open(): Promise<void> {
        const modal = await this.modalCtrl.create({
            component: SettingsSheetComponent,
            breakpoints: [0, 0.9],
            initialBreakpoint: 0.9,
            // Otherwise the content is laid out for the full height while the sheet stops at
            // 0.9, and the last part of the sheet can never be scrolled into view.
            expandToScroll: false,
        });
        await modal.present();
    }
}
