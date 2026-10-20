import {Component, inject} from '@angular/core';
import {AsyncPipe} from '@angular/common';
import {
    IonButton,
    IonIcon,
    IonItem,
    IonLabel,
    IonList,
    IonPopover,
    ModalController,
} from '@ionic/angular';
import {addIcons} from 'ionicons';
import {
    checkmark,
    colorPaletteOutline,
    moonOutline,
    phonePortraitOutline,
    sunnyOutline,
} from 'ionicons/icons';
import {ulid} from 'ulid';
import {ThemeService} from '../theme.service';
import {ThemeMode} from '../theme/theme.model';

@Component({
    selector: 'app-theme-menu',
    templateUrl: './theme-menu.component.html',
    styleUrls: ['./theme-menu.component.scss'],
    imports: [IonButton, IonIcon, IonPopover, IonList, IonItem, IonLabel, AsyncPipe],
})
export class ThemeMenuComponent {
    protected themeService = inject(ThemeService);
    private modalCtrl = inject(ModalController);

    /** The menu can appear on more than one toolbar, so each trigger needs its own id. */
    protected readonly triggerId = 'theme-menu-' + ulid();

    constructor() {
        addIcons({sunnyOutline, moonOutline, phonePortraitOutline, colorPaletteOutline, checkmark});
    }

    async select(mode: ThemeMode): Promise<void> {
        this.themeService.setMode(mode);
        if (mode === 'custom') {
            await this.openEditor();
        }
    }

    private async openEditor(): Promise<void> {
        // Loaded when first opened, so that the controls only it uses (select, range, toggle) are not part of every start
        const {ThemeEditorComponent} = await import('./theme-editor.component');
        const modal = await this.modalCtrl.create({
            component: ThemeEditorComponent,
            breakpoints: [0, 0.9],
            initialBreakpoint: 0.9,
            // Otherwise the content is laid out for the full height while the sheet stops at
            // 0.9, and the last part of the editor can never be scrolled into view.
            expandToScroll: false,
        });
        await modal.present();
    }
}
