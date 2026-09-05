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
} from '@ionic/angular/standalone';
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
import {ThemeEditorComponent} from './theme-editor.component';

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
        const modal = await this.modalCtrl.create({
            component: ThemeEditorComponent,
            breakpoints: [0, 0.9],
            initialBreakpoint: 0.9,
        });
        await modal.present();
    }
}
