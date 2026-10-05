import {Component, ElementRef, inject, OnDestroy, ViewChild} from '@angular/core';
import {AsyncPipe} from '@angular/common';
import {
    AlertController,
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
    IonSelect,
    IonSelectOption,
    IonText,
    IonTitle,
    IonToggle,
    IonToolbar,
    ModalController,
} from '@ionic/angular/standalone';
import {addIcons} from 'ionicons';
import {
    add,
    close,
    colorFillOutline,
    colorPaletteOutline,
    moonOutline,
    phonePortraitOutline,
    sunnyOutline,
} from 'ionicons/icons';
import {OWN_COLOR_TEMPLATE_ID, ThemeService} from '../theme.service';
import {ACCENT_SWATCHES} from '../theme/theme-presets';
import {
    BackgroundFit,
    BackgroundPictureMode,
    ThemeMode,
    ThemeSettings,
    ThemeShade,
    ThemeTemplate,
} from '../theme/theme.model';

function detailValue<T>(event: Event): T | undefined {
    return (event as CustomEvent<{value?: T}>).detail?.value;
}

@Component({
    selector: 'app-theme-editor',
    templateUrl: './theme-editor.component.html',
    styleUrls: ['./theme-editor.component.scss'],
    imports: [
        IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonIcon, IonContent,
        IonSegment, IonSegmentButton, IonLabel, IonItem, IonRange, IonText, IonSelect, IonSelectOption,
        IonToggle, AsyncPipe,
    ],
})
export class ThemeEditorComponent implements OnDestroy {
    protected themeService = inject(ThemeService);
    private modalCtrl = inject(ModalController);
    private alertCtrl = inject(AlertController);

    @ViewChild('fileInput') fileInput: ElementRef<HTMLInputElement>;

    protected readonly accentSwatches = ACCENT_SWATCHES;
    protected readonly settings$ = this.themeService.settings$;
    protected readonly backgroundImageUrl$ = this.themeService.backgroundImageUrl$;
    protected readonly shownPictureId$ = this.themeService.shownPictureId$;
    protected readonly savedColors$ = this.themeService.savedColors$;
    protected imageError: string | null = null;
    /** The folder's pictures with a URL each, for the thumbnails. */
    protected pictures: {id: string, url: string}[] = [];

    private thumbnailUrls = new Map<string, string>();
    private thumbnailTicket = 0;
    private readonly pictureSubscription = this.themeService.pictureIds$
        .subscribe(ids => void this.loadThumbnails(ids));

    constructor() {
        addIcons({
            add, close, colorFillOutline, colorPaletteOutline,
            sunnyOutline, moonOutline, phonePortraitOutline,
        });
    }

    ngOnDestroy(): void {
        this.pictureSubscription.unsubscribe();
        for (const url of this.thumbnailUrls.values()) {
            URL.revokeObjectURL(url);
        }
        this.thumbnailUrls.clear();
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

    saveColour(settings: ThemeSettings): void {
        this.themeService.saveColor(this.accentValue(settings));
    }

    removeColour(colour: string): void {
        this.themeService.removeColor(colour);
    }

    isSaved(settings: ThemeSettings): boolean {
        return this.themeService.isColorSaved(this.accentValue(settings));
    }

    onShadeChange(event: Event): void {
        const value = detailValue<ThemeShade>(event);
        if (value) {
            this.themeService.setCustomShade(value);
        }
    }

    reset(): void {
        this.imageError = null;
        this.themeService.resetToDefault();
        this.close();
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
        return this.themeService.customPageColor(settings.custom);
    }

    /** The plain modes replace the custom theme rather than recolouring it. */
    onModeChange(event: Event): void {
        const value = detailValue<ThemeMode>(event);
        if (value) {
            this.themeService.setMode(value);
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

    pickImage(): void {
        this.imageError = null;
        this.fileInput?.nativeElement.click();
    }

    async onImageSelected(event: Event): Promise<void> {
        const input = event.target as HTMLInputElement;
        const files = Array.from(input.files ?? []);
        input.value = '';
        if (!files.length) {
            return;
        }
        const failed = await this.themeService.addBackgroundImages(files);
        if (failed === files.length) {
            this.imageError = files.length === 1
                ? 'That picture could not be used. Please try another one.'
                : 'Those pictures could not be used. Please try others.';
        } else if (failed) {
            this.imageError = `${failed} of the ${files.length} pictures could not be used.`;
        }
    }

    onPictureModeChange(event: Event): void {
        const value = detailValue<BackgroundPictureMode>(event);
        if (value) {
            this.themeService.setPictureMode(value);
        }
    }

    onIntervalChange(event: Event): void {
        const value = detailValue<number>(event);
        if (typeof value === 'number') {
            this.themeService.setSlideshowInterval(value);
        }
    }

    onShuffleChange(event: Event): void {
        this.themeService.setSlideshowShuffle((event as CustomEvent<{checked: boolean}>).detail.checked);
    }

    showPicture(id: string): void {
        this.imageError = null;
        this.themeService.showPicture(id);
    }

    /** Deleting is the one thing that takes a picture out of the folder, so it asks first. */
    async deletePicture(id: string): Promise<void> {
        const alert = await this.alertCtrl.create({
            header: 'Delete this picture?',
            message: 'It will be removed from this device. This cannot be undone.',
            buttons: [
                {text: 'Cancel', role: 'cancel'},
                {text: 'Delete', role: 'destructive', handler: () => void this.themeService.deletePicture(id)},
            ],
        });
        await alert.present();
    }

    /** A later list supersedes one still loading, and each URL is made once and revoked once. */
    private async loadThumbnails(ids: string[]): Promise<void> {
        const ticket = ++this.thumbnailTicket;
        for (const id of ids) {
            if (!this.thumbnailUrls.has(id)) {
                const blob = await this.themeService.loadPicture(id);
                if (blob && !this.thumbnailUrls.has(id)) {
                    this.thumbnailUrls.set(id, URL.createObjectURL(blob));
                }
            }
        }
        if (ticket !== this.thumbnailTicket) {
            return;
        }
        for (const [id, url] of this.thumbnailUrls) {
            if (!ids.includes(id)) {
                URL.revokeObjectURL(url);
                this.thumbnailUrls.delete(id);
            }
        }
        this.pictures = ids
            .filter(id => this.thumbnailUrls.has(id))
            .map(id => ({id, url: this.thumbnailUrls.get(id) as string}));
    }
}
