import {Component, ElementRef, inject, ViewChild} from '@angular/core';
import {AsyncPipe} from '@angular/common';
import {
    IonButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonIcon,
    IonItem,
    IonLabel,
    IonRange,
    IonSegment,
    IonSegmentButton,
    IonText,
    IonTitle,
    IonToolbar,
    ModalController,
} from '@ionic/angular/standalone';
import {addIcons} from 'ionicons';
import {close, colorPaletteOutline, imageOutline, moonOutline, phonePortraitOutline, sunnyOutline} from 'ionicons/icons';
import {OWN_COLOR_TEMPLATE_ID, ThemeService} from '../theme.service';
import {ACCENT_SWATCHES} from '../theme/theme-presets';
import {BackgroundFit, ThemeMode, ThemeSettings, ThemeTemplate} from '../theme/theme.model';

function detailValue<T>(event: Event): T | undefined {
    return (event as CustomEvent<{value?: T}>).detail?.value;
}

@Component({
    selector: 'app-theme-editor',
    templateUrl: './theme-editor.component.html',
    styleUrls: ['./theme-editor.component.scss'],
    imports: [
        IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonIcon, IonContent,
        IonSegment, IonSegmentButton, IonLabel, IonItem, IonRange, IonText, AsyncPipe,
    ],
})
export class ThemeEditorComponent {
    protected themeService = inject(ThemeService);
    private modalCtrl = inject(ModalController);

    @ViewChild('fileInput') fileInput: ElementRef<HTMLInputElement>;

    protected readonly accentSwatches = ACCENT_SWATCHES;
    protected readonly settings$ = this.themeService.settings$;
    protected readonly backgroundImageUrl$ = this.themeService.backgroundImageUrl$;
    protected imageError: string | null = null;

    constructor() {
        addIcons({close, colorPaletteOutline, imageOutline, sunnyOutline, moonOutline, phonePortraitOutline});
    }

    close(): void {
        this.modalCtrl.dismiss();
    }

    selectTemplate(templateId: string): void {
        this.themeService.selectTemplate(templateId);
    }

    selectAccent(accent: string): void {
        this.themeService.setAccent(accent);
    }

    reset(): void {
        this.imageError = null;
        this.themeService.resetCustom();
    }

    /** A template reads as its page colour beside the colour everything else is drawn in. */
    templateSwatch(template: ThemeTemplate): Record<string, string> {
        const accent = template.seed.accent ?? '';
        return {
            '--swatch-from': template.seed.surfaceTint ?? accent,
            '--swatch-to': accent,
        };
    }

    isAccent(settings: ThemeSettings, swatch: string): boolean {
        return settings.custom.templateId === OWN_COLOR_TEMPLATE_ID
            && settings.custom.seed.accent?.toLowerCase() === swatch.toLowerCase();
    }

    accentValue(settings: ThemeSettings): string {
        return settings.custom.seed.accent
            ?? this.themeService.preview(settings.custom.seed)['--ion-color-primary'];
    }

    backgroundValue(settings: ThemeSettings): string {
        return settings.custom.background.color
            ?? this.themeService.preview(settings.custom.seed)['--ion-background-color'];
    }

    /** The plain modes replace the custom theme rather than recolouring it. */
    onModeChange(event: Event): void {
        const value = detailValue<ThemeMode>(event);
        if (value) {
            this.themeService.setMode(value);
            this.close();
        }
    }

    onFitChange(event: Event): void {
        const value = detailValue<BackgroundFit>(event);
        if (value) {
            this.themeService.setBackgroundFit(value);
        }
    }

    onOpacityChange(event: Event): void {
        const value = detailValue<number>(event);
        if (typeof value === 'number') {
            this.themeService.setBackgroundOpacity(value);
        }
    }

    onBlurChange(event: Event): void {
        const value = detailValue<number>(event);
        if (typeof value === 'number') {
            this.themeService.setBackgroundBlur(value);
        }
    }

    onAccentInput(event: Event): void {
        this.themeService.setAccent((event.target as HTMLInputElement).value);
    }

    onBackgroundColorInput(event: Event): void {
        this.themeService.setBackgroundColor((event.target as HTMLInputElement).value);
    }

    clearBackgroundColor(): void {
        this.themeService.setBackgroundColor(null);
    }

    pickImage(): void {
        this.imageError = null;
        this.fileInput?.nativeElement.click();
    }

    async onImageSelected(event: Event): Promise<void> {
        const input = event.target as HTMLInputElement;
        const file = input.files?.[0];
        input.value = '';
        if (!file) {
            return;
        }
        try {
            await this.themeService.setBackgroundImage(file);
        } catch {
            this.imageError = 'That picture could not be used. Please try another one.';
        }
    }

    async removeImage(): Promise<void> {
        this.imageError = null;
        await this.themeService.clearBackgroundImage();
    }
}
