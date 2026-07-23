import {Component, inject} from '@angular/core';
import {
    IonButton,
    IonIcon,
    IonItem,
    IonLabel,
    IonList,
    PopoverController,
} from '@ionic/angular/standalone';
import {ThemeService, THEME_OPTIONS, ThemeMode} from '../theme.service';
import {AsyncPipe, NgClass} from '@angular/common';
import {addIcons} from 'ionicons';
import {sunny, moon, heart, phonePortrait, checkmark} from 'ionicons/icons';

/**
 * Popover content showing all theme options.
 * This is presented inside the popover triggered by ThemeDropdownComponent.
 */
@Component({
    selector: 'app-theme-popover',
    template: `
        <ion-list lines="none" class="theme-popover-list">
            @for (option of themeOptions; track option.mode) {
                <ion-item
                    button
                    (click)="selectTheme(option.mode)"
                    [class.active-theme]="option.mode === (themeService.currentTheme$ | async)"
                >
                    <ion-icon [name]="option.icon" slot="start" class="theme-option-icon"></ion-icon>
                    <ion-label>{{ option.label }}</ion-label>
                    @if (option.mode === (themeService.currentTheme$ | async)) {
                        <ion-icon name="checkmark" slot="end" color="primary"></ion-icon>
                    }
                </ion-item>
            }
        </ion-list>
    `,
    styles: [`
        .theme-popover-list {
            padding: 0.25rem 0;
        }

        .theme-popover-list ion-item {
            --min-height: 44px;
            cursor: pointer;
        }

        .theme-option-icon {
            font-size: 1.2rem;
            margin-inline-end: 0.75rem;
        }

        .active-theme {
            --background: var(--ion-color-primary-tint, rgba(56, 128, 255, 0.08));
            font-weight: 600;
        }
    `],
    imports: [IonList, IonItem, IonIcon, IonLabel, AsyncPipe],
})
export class ThemePopoverComponent {
    themeService = inject(ThemeService);
    private popoverCtrl = inject(PopoverController);

    /** Expose the theme options config to the template */
    themeOptions = THEME_OPTIONS;

    selectTheme(mode: ThemeMode): void {
        this.themeService.setTheme(mode);
        this.popoverCtrl.dismiss();
    }
}

/**
 * Reusable theme dropdown trigger button.
 * Place this in any toolbar or container — it renders a single icon button
 * that opens a popover with all theme options.
 */
@Component({
    selector: 'app-theme-dropdown',
    template: `
        <ion-button fill="clear" (click)="openPopover($event)" aria-label="Change theme">
            <ion-icon
                slot="icon-only"
                [name]="getIcon()"
                [color]="getIconColor()"
            ></ion-icon>
        </ion-button>
    `,
    styles: [`
        :host {
            display: inline-flex;
            align-items: center;
        }
    `],
    imports: [IonButton, IonIcon],
})
export class ThemeDropdownComponent {
    themeService = inject(ThemeService);
    private popoverCtrl = inject(PopoverController);

    constructor() {
        addIcons({sunny, moon, heart, phonePortrait, checkmark});
    }

    /** Map the current theme to the appropriate trigger icon */
    getIcon(): string {
        const option = THEME_OPTIONS.find(o => o.mode === this.themeService.currentTheme);
        return option?.icon ?? 'sunny';
    }

    /** Map the current theme to icon color */
    getIconColor(): string {
        const option = THEME_OPTIONS.find(o => o.mode === this.themeService.currentTheme);
        return option?.iconColor ?? 'warning';
    }

    async openPopover(event: Event): Promise<void> {
        const popover = await this.popoverCtrl.create({
            component: ThemePopoverComponent,
            event,
            translucent: true,
            showBackdrop: false,
            dismissOnSelect: true,
        });
        await popover.present();
    }
}
