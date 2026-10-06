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
import {add, close, moonOutline, sunnyOutline} from 'ionicons/icons';
import {ThemeService} from '../theme.service';
import {CssVariables} from '../theme/palette';
import {ACCENT_SWATCHES, COLOR_ROLES, PAGE_SWATCHES} from '../theme/theme-presets';
import {
    BackgroundFit,
    BackgroundPictureMode,
    ColorRole,
    CustomTheme,
    ThemeSettings,
    ThemeTemplate,
    ThemeTemplateGroup,
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

    protected readonly colorRoles = COLOR_ROLES;
    /** The colour the palette below sets. */
    protected role: ColorRole = 'primary';
    protected readonly settings$ = this.themeService.settings$;
    protected readonly backgroundImageUrl$ = this.themeService.backgroundImageUrl$;
    protected readonly shownPictureId$ = this.themeService.shownPictureId$;
    protected readonly savedColors$ = this.themeService.savedColors$;
    protected imageError: string | null = null;
    /** The folder's pictures with a URL each, for the thumbnails. */
    protected pictures: {id: string, url: string}[] = [];

    private paletteCache: {custom: CustomTheme, variables: CssVariables} | null = null;
    private thumbnailUrls = new Map<string, string>();
    private thumbnailTicket = 0;
    private readonly pictureSubscription = this.themeService.pictureIds$
        .subscribe(ids => void this.loadThumbnails(ids));

    constructor() {
        addIcons({add, close, sunnyOutline, moonOutline});
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

    templatesIn(group: ThemeTemplateGroup): ThemeTemplate[] {
        return this.themeService.templates.filter(template => template.group === group);
    }

    get roleHint(): string {
        return this.colorRoles.find(option => option.value === this.role)?.hint ?? '';
    }

    /** Pages need colours text can sit on; the other two roles take any accent. */
    get roleSwatches(): string[] {
        return this.role === 'background' ? PAGE_SWATCHES : ACCENT_SWATCHES;
    }

    onRoleChange(event: Event): void {
        const value = detailValue<ColorRole>(event);
        if (value) {
            this.role = value;
        }
    }

    /** Sets the chosen role's colour and nothing else. */
    pick(colour: string): void {
        if (this.role === 'primary') {
            this.themeService.setAccent(colour);
        } else if (this.role === 'secondary') {
            this.themeService.setSecondaryColor(colour);
        } else {
            this.themeService.setPage(colour);
        }
    }

    onColorInput(event: Event): void {
        this.pick((event.target as HTMLInputElement).value);
    }

    useAutoSecondary(): void {
        this.themeService.setSecondaryColor(null);
    }

    /**
     * Light and Dark set how the custom theme draws the primary colour, on a light page tinted
     * with it or a dark page filled with it. They are not the app's own light and dark modes.
     */
    useShade(shade: 'light' | 'dark'): void {
        this.themeService.setPage(shade);
    }

    isShade(settings: ThemeSettings, shade: 'light' | 'dark'): boolean {
        return settings.custom.background.color === null && settings.custom.shade === shade;
    }

    /** Hands the page back to the primary colour, on the shade chosen under Primary. */
    useAutoPage(settings: ThemeSettings): void {
        this.themeService.setPage(settings.custom.shade === 'dark' ? 'dark' : 'light');
    }

    isAutoPage(settings: ThemeSettings): boolean {
        return settings.custom.background.color === null;
    }

    /** The colour a role ends up as, which for Auto and a derived page is the one worked out. */
    roleColor(role: ColorRole, settings: ThemeSettings): string {
        const custom = settings.custom;
        const palette = this.palette(custom);
        if (role === 'primary') {
            return custom.seed.accent ?? palette['--ion-color-primary'];
        }
        if (role === 'secondary') {
            return custom.seed.companion ?? palette['--ion-color-secondary'];
        }
        return custom.background.color ?? palette['--ion-background-color'];
    }

    /** Only a colour the reader chose is marked, never one the theme worked out for them. */
    isChosen(settings: ThemeSettings, swatch: string): boolean {
        const custom = settings.custom;
        const chosen = this.role === 'primary' ? custom.seed.accent
            : this.role === 'secondary' ? custom.seed.companion
                : custom.background.color;
        return chosen?.toLowerCase() === swatch.toLowerCase();
    }

    saveColour(settings: ThemeSettings): void {
        this.themeService.saveColor(this.roleColor(this.role, settings));
    }

    removeColour(colour: string): void {
        this.themeService.removeColor(colour);
    }

    isSaved(settings: ThemeSettings): boolean {
        return this.themeService.isColorSaved(this.roleColor(this.role, settings));
    }

    reset(): void {
        this.imageError = null;
        this.themeService.restorePlainLight();
        this.close();
    }

    /** A template reads as its page colour beside the colour everything else is drawn in. */
    templateSwatch(template: ThemeTemplate): Record<string, string> {
        const accent = template.seed.accent ?? '';
        return {
            '--swatch-from': template.seed.surfaceTint ?? template.background ?? accent,
            '--swatch-to': accent,
        };
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

    /** Worked out once per change of theme, however many times the template asks. */
    private palette(custom: CustomTheme): CssVariables {
        if (this.paletteCache?.custom !== custom) {
            this.paletteCache = {custom, variables: this.themeService.customVariables(custom)};
        }
        return this.paletteCache.variables;
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
