import {afterNextRender, Component, ElementRef, inject, Injector, Input, OnInit, ViewChild, ViewEncapsulation} from '@angular/core';
import {
    AlertController,
    IonButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonIcon,
    IonInput,
    IonSpinner,
    IonTextarea,
    IonTitle,
    IonToolbar,
    ModalController,
} from '@ionic/angular/standalone';
import {addIcons} from 'ionicons';
import {addOutline, arrowDown, arrowUp, closeOutline, eyeOutline, imageOutline, timeOutline, trashOutline} from 'ionicons/icons';
import {StudyAidsService} from '../study-aids.service';
import {CreditFieldComponent} from './credit-field.component';
import {RichTextComponent} from './rich-text.component';
import {formatStamp, renderBlock, renderInline} from '../study-aids/checklist';
import {joinNames} from '../study-aids/byline';
import {describeFailure} from '../study-aids/failures';
import {IMAGE_TYPES} from '../study-aids/images';
import {readCredit, writeCredit} from '../study-aids/local-store';
import {uploadPickedImage} from '../study-aids/upload-image';
import {
    blankQuestionForm,
    CHOICE_LETTERS,
    errorsByQuestion,
    QuestionForm,
    questionChange,
    questionForm,
    questionProblems,
    resetsStats,
} from '../study-aids/quiz';
import {GenerationState, LecturePlayback, LIMITS, QuizPart, SaveFailure} from '../study-aids/study-aids.model';

function inputValue(event: Event): string {
    return (event as CustomEvent<{value: string | null}>).detail.value ?? '';
}

/**
 * Editors add, remove, reorder and correct the lecture's questions here, and save them all
 * at once.
 */
@Component({
    selector: 'app-quiz-editor',
    templateUrl: './quiz-editor.component.html',
    styleUrls: ['./quiz-editor.component.scss'],
    // Sizes the ion-modal, which sits outside this component (see _study-editor.scss)
    encapsulation: ViewEncapsulation.None,
    imports: [
        IonHeader,
        IonToolbar,
        IonTitle,
        IonButtons,
        IonButton,
        IonContent,
        IonIcon,
        IonInput,
        IonTextarea,
        IonSpinner,
        CreditFieldComponent,
        RichTextComponent,
    ],
})
export class QuizEditorComponent implements OnInit {
    private service = inject(StudyAidsService);
    private modalCtrl = inject(ModalController);
    private alertCtrl = inject(AlertController);
    private injector = inject(Injector);

    @Input() videoId: number;
    @Input() quiz: QuizPart | null = null;
    @Input() generation: GenerationState = 'none';
    /** The lecture's length in seconds, when known, to check the video times against. */
    @Input() duration: number | null = null;
    @Input() playback: LecturePlayback | null = null;

    @ViewChild('imagePicker') imagePicker: ElementRef<HTMLInputElement>;

    protected forms: QuestionForm[] = [];
    protected credit = readCredit();
    protected saving = false;
    protected problem: string | null = null;
    /** Problems are pointed out once the editor first tries to save, not while typing. */
    protected checked = false;
    protected removed: {form: QuestionForm; index: number} | null = null;
    /** Which field an image is uploading into, as `key-field`. */
    protected uploadingFor: string | null = null;
    protected previewing = new Set<number>();
    protected readonly imageTypes = IMAGE_TYPES.join(',');
    protected readonly letters = CHOICE_LETTERS;
    protected readonly limits = LIMITS;
    protected readonly resetsStats = resetsStats;

    private serverProblems = new Map<number, string[]>();
    private pickTarget: {form: QuestionForm; field: 'prompt' | 'explanation'} | null = null;
    private previews = new Map<string, string>();
    private nextKey = 0;
    private baseRevision = 0;
    private savedSnapshot = '';
    private readonly savedCredit = this.credit;

    constructor() {
        addIcons({addOutline, arrowDown, arrowUp, closeOutline, eyeOutline, imageOutline, timeOutline, trashOutline});
    }

    ngOnInit(): void {
        this.load(this.quiz);
    }

    get notice(): string | null {
        if (!this.quiz) {
            return this.generation === 'pending'
                ? 'The AI is still drafting questions. Once you save yours, the AI draft will not replace them.'
                : null;
        }

        return this.quiz.origin === 'ai' && !this.quiz.edited
            ? 'These are the AI\'s questions. Once you save a change, the AI will not rewrite them.'
            : null;
    }

    get maxTime(): number {
        return this.duration && this.duration > 0 ? Math.floor(this.duration) : LIMITS.maxTime;
    }

    get changed(): boolean {
        return this.snapshot() !== this.savedSnapshot
            || this.credit !== this.savedCredit;
    }

    problemsOf(form: QuestionForm, index: number): string[] {
        return [
            ...(this.checked ? questionProblems(form, this.maxTime) : []),
            ...(this.serverProblems.get(index) ?? []),
        ];
    }

    add(): void {
        const form = blankQuestionForm(this.nextKey++);
        this.forms = [...this.forms, form];
        this.edited();
        this.reveal(form);
    }

    remove(index: number): void {
        this.removed = {form: this.forms[index], index};
        this.forms = this.forms.filter((form, i) => i !== index);
        this.edited();
    }

    undoRemove(): void {
        if (!this.removed) {
            return;
        }
        const {form, index} = this.removed;
        this.forms = [...this.forms.slice(0, index), form, ...this.forms.slice(index)];
        this.removed = null;
        this.edited();
    }

    move(index: number, offset: number): void {
        const target = index + offset;
        if (target < 0 || target >= this.forms.length) {
            return;
        }
        const forms = [...this.forms];
        [forms[index], forms[target]] = [forms[target], forms[index]];
        this.forms = forms;
        this.edited();
    }

    setPrompt(form: QuestionForm, event: Event): void {
        form.prompt = inputValue(event);
        this.edited();
    }

    setChoice(form: QuestionForm, index: number, event: Event): void {
        form.choices[index] = inputValue(event);
        this.edited();
    }

    setAnswer(form: QuestionForm, index: number): void {
        form.answer = index;
        this.edited();
    }

    addChoice(form: QuestionForm): void {
        if (form.choices.length < LIMITS.maxChoices) {
            form.choices = [...form.choices, ''];
            this.edited();
        }
    }

    removeChoice(form: QuestionForm, index: number): void {
        if (form.choices.length <= LIMITS.minChoices) {
            return;
        }
        form.choices = form.choices.filter((choice, i) => i !== index);
        if (form.answer === index) {
            form.answer = null;
        } else if (form.answer !== null && form.answer > index) {
            form.answer--;
        }
        this.edited();
    }

    setExplanation(form: QuestionForm, event: Event): void {
        form.explanation = inputValue(event);
        this.edited();
    }

    setTime(form: QuestionForm, event: Event): void {
        form.time = inputValue(event);
        this.edited();
    }

    pickImage(form: QuestionForm, field: 'prompt' | 'explanation'): void {
        this.pickTarget = {form, field};
        this.imagePicker.nativeElement.click();
    }

    async onImagePicked(event: Event): Promise<void> {
        const picker = event.target as HTMLInputElement;
        const file = picker.files?.[0];
        // Cleared so that picking the same file again still counts as a change.
        picker.value = '';
        const target = this.pickTarget;
        this.pickTarget = null;
        if (!file || !target) {
            return;
        }
        this.uploadingFor = target.form.key + '-' + target.field;
        this.problem = null;
        try {
            const markdown = await uploadPickedImage(this.service, this.videoId, file);
            const current = target.form[target.field].trimEnd();
            target.form[target.field] = (current ? current + '\n\n' : '') + markdown;
            this.previewing.add(target.form.key);
            this.edited();
        } catch (error) {
            this.problem = (error as Error).message;
        } finally {
            this.uploadingFor = null;
        }
    }

    togglePreview(form: QuestionForm): void {
        if (!this.previewing.delete(form.key)) {
            this.previewing.add(form.key);
        }
    }

    /** Rendered Markdown for the previews, kept so typing elsewhere does not redo it. */
    preview(markdown: string, inline = false): string {
        const key = (inline ? 'i:' : 'b:') + markdown;
        let html = this.previews.get(key);
        if (html === undefined) {
            if (this.previews.size > 300) {
                this.previews.clear();
            }
            html = inline ? renderInline(markdown) : renderBlock(markdown);
            this.previews.set(key, html);
        }

        return html;
    }

    useCurrentTime(form: QuestionForm): void {
        if (this.playback) {
            form.time = formatStamp(this.playback.currentTime());
            this.edited();
        }
    }

    async save(): Promise<void> {
        if (this.saving) {
            return;
        }
        this.checked = true;
        const invalid = this.forms
            .map((form, index) => questionProblems(form, this.maxTime).length ? index + 1 : 0)
            .filter(number => number > 0);
        if (invalid.length) {
            this.problem = `Fix ${invalid.length === 1 ? 'question' : 'questions'} ${joinNames(invalid.map(String))} first.`;
            this.reveal(this.forms[invalid[0] - 1]);

            return;
        }
        if (this.forms.length > LIMITS.questions) {
            this.problem = `A quiz can have at most ${LIMITS.questions} questions.`;

            return;
        }
        if (!this.forms.length && this.quiz?.questions.length && !(await this.confirmRemoveAll())) {
            return;
        }

        this.saving = true;
        this.problem = null;
        this.serverProblems.clear();
        this.service.saveQuiz(this.videoId, {
            questions: this.forms.map(questionChange),
            revision: this.baseRevision,
            credit: this.credit,
        }).subscribe({
            next: () => {
                this.saving = false;
                writeCredit(this.credit);
                void this.modalCtrl.dismiss(null, 'saved');
            },
            error: (failure: SaveFailure) => {
                this.saving = false;
                void this.explain(failure);
            },
        });
    }

    async cancel(): Promise<void> {
        if (this.snapshot() !== this.savedSnapshot) {
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

    private load(quiz: QuizPart | null): void {
        this.forms = (quiz?.questions ?? []).map(question => questionForm(question, this.nextKey++));
        this.baseRevision = quiz?.revision ?? 0;
        this.savedSnapshot = this.snapshot();
        this.serverProblems.clear();
        this.removed = null;
        this.checked = false;
    }

    /** Problems FlickMan reported are tied to positions, which an edit may have changed. */
    private edited(): void {
        this.serverProblems.clear();
    }

    private snapshot(): string {
        return JSON.stringify(this.forms.map(form => [form.id, form.prompt, form.choices, form.answer, form.explanation, form.time]));
    }

    private reveal(form: QuestionForm): void {
        afterNextRender(() => document.getElementById('question-' + form.key)
            ?.scrollIntoView({behavior: 'smooth', block: 'center'}), {injector: this.injector});
    }

    private async confirmRemoveAll(): Promise<boolean> {
        const alert = await this.alertCtrl.create({
            header: 'Remove every question?',
            message: 'Readers will not see a quiz for this lecture.',
            buttons: [
                {text: 'Keep editing', role: 'cancel'},
                {text: 'Remove all', role: 'destructive'},
            ],
        });
        await alert.present();

        return (await alert.onDidDismiss()).role === 'destructive';
    }

    private async explain(failure: SaveFailure): Promise<void> {
        if (failure.kind === 'conflict') {
            return this.resolveConflict(failure.current as QuizPart | null);
        }
        if (failure.kind === 'invalid') {
            const {byQuestion, general} = errorsByQuestion(failure.errors);
            this.serverProblems = byQuestion;
            this.problem = general.length ? general.join(' ') : failure.message;

            return;
        }
        this.problem = failure.kind === 'forbidden' ? 'This account can no longer edit questions.' : describeFailure(failure);
    }

    private async resolveConflict(current: QuizPart | null): Promise<void> {
        const alert = await this.alertCtrl.create({
            header: 'Someone else saved first',
            message: 'Another editor changed these questions while you were editing them.',
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
            this.load(current);
        } else if (role === 'mine') {
            // Questions they removed or the AI replaced are sent as new ones.
            const ids = new Set(current?.questions.map(question => question.id) ?? []);
            for (const form of this.forms) {
                if (form.id && !ids.has(form.id)) {
                    form.id = null;
                    form.stats = null;
                    form.original = null;
                }
            }
            this.baseRevision = current?.revision ?? 0;
            await this.save();
        }
    }
}
