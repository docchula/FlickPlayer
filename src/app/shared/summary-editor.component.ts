import {Component, ElementRef, inject, Input, OnDestroy, OnInit, ViewChild, ViewEncapsulation} from '@angular/core';
import {DecimalPipe} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {
    AlertController,
    IonButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonLabel,
    IonSegment,
    IonSegmentButton,
    IonSpinner,
    IonTitle,
    IonToolbar,
    ModalController,
} from '@ionic/angular/standalone';
import {StudyAidsService} from '../study-aids.service';
import {ChecklistViewComponent} from './checklist-view.component';
import {CreditFieldComponent} from './credit-field.component';
import {buildChecklist, Checklist, formatStamp} from '../study-aids/checklist';
import {creditFields} from '../study-aids/byline';
import {describeFailure} from '../study-aids/failures';
import {IMAGE_TYPES} from '../study-aids/images';
import {readCreditChoice, writeCreditChoice} from '../study-aids/local-store';
import {uploadPickedImage} from '../study-aids/upload-image';
import {CreditChoice, GenerationState, LecturePlayback, LIMITS, SaveFailure, SummaryPart} from '../study-aids/study-aids.model';

/** Editors rewrite the summary's Markdown here, with a live preview of the checklist it makes. */
@Component({
    selector: 'app-summary-editor',
    templateUrl: './summary-editor.component.html',
    styleUrls: ['./summary-editor.component.scss'],
    // Sizes the ion-modal, which sits outside this component (see _study-editor.scss)
    encapsulation: ViewEncapsulation.None,
    imports: [
        DecimalPipe,
        FormsModule,
        IonHeader,
        IonToolbar,
        IonTitle,
        IonButtons,
        IonButton,
        IonContent,
        IonSegment,
        IonSegmentButton,
        IonLabel,
        IonSpinner,
        ChecklistViewComponent,
        CreditFieldComponent,
    ],
})
export class SummaryEditorComponent implements OnInit, OnDestroy {
    private service = inject(StudyAidsService);
    private modalCtrl = inject(ModalController);
    private alertCtrl = inject(AlertController);

    @Input() videoId: number;
    @Input() summary: SummaryPart | null = null;
    @Input() generation: GenerationState = 'none';
    @Input() playback: LecturePlayback | null = null;

    @ViewChild('input') input: ElementRef<HTMLTextAreaElement>;

    protected readonly limit = LIMITS.summaryChars;
    protected readonly imageTypes = IMAGE_TYPES.join(',');
    protected text = '';
    protected mode: 'write' | 'preview' = 'write';
    protected preview: Checklist = buildChecklist('');
    protected credit: CreditChoice = readCreditChoice();
    protected saving = false;
    protected uploading = false;
    protected problem: string | null = null;
    protected showHelp = false;

    private baseRevision = 0;
    private savedText = '';
    private readonly savedCredit = this.credit;
    private previewTimer: ReturnType<typeof setTimeout> | undefined;

    ngOnInit(): void {
        this.text = this.savedText = this.summary?.markdown ?? '';
        this.baseRevision = this.summary?.revision ?? 0;
        this.preview = buildChecklist(this.text);
    }

    ngOnDestroy(): void {
        clearTimeout(this.previewTimer);
    }

    get notice(): string | null {
        if (!this.summary) {
            return this.generation === 'pending'
                ? 'The AI is still drafting a summary. Once you save yours, the AI draft will not replace it.'
                : null;
        }

        return this.summary.origin === 'ai' && !this.summary.edited
            ? 'This is the AI draft. Once you save a change, the AI will not rewrite it.'
            : null;
    }

    get changed(): boolean {
        return this.text !== this.savedText
            || this.credit.credit !== this.savedCredit.credit
            || (this.credit.credit && this.credit.name.trim() !== this.savedCredit.name.trim());
    }

    canSave(): boolean {
        return !this.saving && this.changed && !!this.text.trim() && this.text.length <= this.limit;
    }

    onTextChange(): void {
        this.problem = null;
        clearTimeout(this.previewTimer);
        this.previewTimer = setTimeout(() => this.preview = buildChecklist(this.text), 300);
    }

    onModeChange(event: Event): void {
        this.mode = (event as CustomEvent<{value: string}>).detail.value === 'preview' ? 'preview' : 'write';
        if (this.mode === 'preview') {
            clearTimeout(this.previewTimer);
            this.preview = buildChecklist(this.text);
        }
    }

    /** Wraps the selection in a marker such as `**`, or inserts an example to type over. */
    wrap(marker: string): void {
        const input = this.input.nativeElement;
        const start = input.selectionStart;
        const selected = input.value.slice(start, input.selectionEnd) || 'text';
        this.insert(marker + selected + marker, start, input.selectionEnd);
        input.setSelectionRange(start + marker.length, start + marker.length + selected.length);
    }

    /** Puts the video's current time at the cursor, for the end of a section heading. */
    insertTime(): void {
        if (!this.playback) {
            return;
        }
        const input = this.input.nativeElement;
        const before = input.value.slice(0, input.selectionStart);
        const stamp = (before && !/\s$/.test(before) ? ' ' : '') + '[' + formatStamp(this.playback.currentTime()) + ']';
        this.insert(stamp, input.selectionStart, input.selectionEnd);
    }

    async onImagePicked(event: Event): Promise<void> {
        const picker = event.target as HTMLInputElement;
        const file = picker.files?.[0];
        // Cleared so that picking the same file again still counts as a change.
        picker.value = '';
        if (!file) {
            return;
        }
        // The cursor may move while the image uploads, so the place to put it is taken now.
        const {selectionStart: start, selectionEnd: end} = this.input.nativeElement;
        this.uploading = true;
        this.problem = null;
        try {
            const markdown = await uploadPickedImage(this.service, this.videoId, file);
            this.insert('\n' + markdown + '\n', start, end);
        } catch (error) {
            this.problem = (error as Error).message;
        } finally {
            this.uploading = false;
        }
    }

    save(): void {
        if (!this.canSave()) {
            return;
        }
        this.saving = true;
        this.problem = null;
        this.service.saveSummary(this.videoId, {
            markdown: this.text.trim(),
            revision: this.baseRevision,
            ...creditFields(this.credit),
        }).subscribe({
            next: () => {
                this.saving = false;
                writeCreditChoice(this.credit);
                void this.modalCtrl.dismiss(null, 'saved');
            },
            error: (failure: SaveFailure) => {
                this.saving = false;
                void this.explain(failure);
            },
        });
    }

    async cancel(): Promise<void> {
        if (this.text !== this.savedText) {
            const alert = await this.alertCtrl.create({
                header: 'Discard your changes?',
                buttons: [
                    {text: 'Keep editing', role: 'cancel'},
                    {text: 'Discard', role: 'destructive'},
                ],
            });
            await alert.present();
            if ((await alert.onDidDismiss()).role !== 'destructive') {
                return;
            }
        }
        await this.modalCtrl.dismiss(null, 'cancel');
    }

    private insert(text: string, start: number, end: number): void {
        const input = this.input.nativeElement;
        input.setRangeText(text, start, end, 'end');
        input.focus();
        // Lets ngModel see the change.
        input.dispatchEvent(new Event('input'));
    }

    private async explain(failure: SaveFailure): Promise<void> {
        if (failure.kind === 'conflict') {
            return this.resolveConflict(failure.current as SummaryPart | null);
        }
        this.problem = failure.kind === 'forbidden'
            ? 'This account can no longer edit summaries. Copy your text if you want to keep it.'
            : describeFailure(failure);
    }

    private async resolveConflict(current: SummaryPart | null): Promise<void> {
        const alert = await this.alertCtrl.create({
            header: 'Someone else saved first',
            message: 'Another editor changed this summary while you were editing it.',
            backdropDismiss: false,
            buttons: [
                {text: 'Keep editing', role: 'cancel'},
                {text: 'Discard mine, load theirs', role: 'theirs'},
                {text: 'Replace theirs with mine', role: 'mine'},
            ],
        });
        await alert.present();
        const {role} = await alert.onDidDismiss();
        if (role === 'theirs') {
            this.text = this.savedText = current?.markdown ?? '';
            this.baseRevision = current?.revision ?? 0;
            this.preview = buildChecklist(this.text);
        } else if (role === 'mine') {
            this.baseRevision = current?.revision ?? 0;
            this.save();
        }
    }
}
