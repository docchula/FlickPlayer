import {Component, DestroyRef, EventEmitter, inject, Input, OnChanges, Output} from '@angular/core';
import {AsyncPipe} from '@angular/common';
import {IonButton, IonIcon, IonSpinner, ModalController} from '@ionic/angular';
import {addIcons} from 'ionicons';
import {
    checkmarkCircle,
    closeCircle,
    createOutline,
    peopleOutline,
    playCircleOutline,
    refreshOutline,
    shareSocialOutline,
} from 'ionicons/icons';
import {Observable, of, Subscription} from 'rxjs';
import {catchError, map, startWith} from 'rxjs/operators';
import {Lecture} from '../man.service';
import {StudyAidsService} from '../study-aids.service';
import {StudyAidsProgressService} from '../study-aids-progress.service';
import {RichTextComponent} from './rich-text.component';
import {QuizEditorComponent} from './quiz-editor.component';
import {QuizChangesComponent} from './quiz-changes.component';
import {QuestionSheetComponent} from './question-sheet.component';
import {VerificationComponent} from './verification.component';
import {PartView, VersionSwitchComponent} from './version-switch.component';
import {openEditorsList} from './study-aids-editors.component';
import {formatClock, plainText, renderBlock, renderInline} from '../study-aids/checklist';
import {byline, formatDay} from '../study-aids/byline';
import {aiOriginal, HistoryState, quizChanges, QuizChanges} from '../study-aids/changes';
import {describeFailure} from '../study-aids/failures';
import {CHOICE_LETTERS, effectiveAnswers, score} from '../study-aids/quiz';
import {LecturePlayback, QuizQuestion, QuizRevision, RevisionQuestion, SaveFailure, StudyAids} from '../study-aids/study-aids.model';

/** Fewer answers than this say nothing about how hard a question is. */
const MIN_ANSWERS_FOR_STATS = 5;

/** `?video=…&quiz=1` opens the lecture with its quiz ready, which is what a shared link sends. */
export const QUIZ_LINK_PARAM = 'quiz';

interface QuizItem {
    question: QuizQuestion;
    promptHtml: string;
    promptText: string;
    choicesHtml: string[];
    explanationHtml: string | null;
}

type ChoiceState = 'correct' | 'wrong' | 'muted' | null;

/**
 * A lecture's practice questions, one at a time, with the answer, the explanation and how the
 * class did shown as soon as the reader picks a choice. Used on the card and in the reading window.
 */
@Component({
    selector: 'app-quiz-body',
    templateUrl: './quiz-body.component.html',
    styleUrls: ['./quiz-body.component.scss'],
    imports: [
        AsyncPipe,
        IonButton,
        IonIcon,
        IonSpinner,
        RichTextComponent,
        QuizChangesComponent,
        QuestionSheetComponent,
        VerificationComponent,
        VersionSwitchComponent,
    ],
    host: {'[class.reader]': 'reader'},
})
export class QuizBodyComponent implements OnChanges {
    private service = inject(StudyAidsService);
    private progress = inject(StudyAidsProgressService);
    private modalCtrl = inject(ModalController);

    @Input({required: true}) aids: StudyAids;
    @Input({required: true}) video: Lecture;
    @Input() playback: LecturePlayback | null = null;
    /** Laid out for the reading window rather than the card. */
    @Input() reader = false;
    @Output() seek = new EventEmitter<number>();

    protected items: QuizItem[] = [];
    /** The answers shown, by question id. */
    protected answers: Record<string, number> = {};
    /** The open question; null shows the start or, once everything is answered, the results. */
    protected current: number | null = null;
    /** Read out by screen readers when an answer is checked. */
    protected announcement = '';
    /** What happened to the last shared link. */
    protected shareNote = '';
    protected view: PartView = 'current';
    protected history$: Observable<HistoryState<RevisionQuestion[]>> | null = null;
    protected readonly byline = byline;
    protected readonly formatClock = formatClock;
    protected readonly formatDay = formatDay;

    private videoId: number | null = null;
    private historyOf: number | null = null;
    private derivedFrom: QuizRevision[] | null = null;
    private derived: {original: QuizRevision | null; changes: QuizChanges | null} | null = null;
    private stored: Record<string, number> | null = null;
    private storedSubscription: Subscription | null = null;
    private renderedFrom: QuizQuestion[] | null = null;

    constructor() {
        addIcons({checkmarkCircle, closeCircle, createOutline, peopleOutline, playCircleOutline, refreshOutline, shareSocialOutline});
        inject(DestroyRef).onDestroy(() => this.storedSubscription?.unsubscribe());
    }

    ngOnChanges(): void {
        if (this.aids.video_id !== this.videoId) {
            this.videoId = this.aids.video_id;
            this.current = null;
            this.announcement = '';
            this.shareNote = '';
            this.view = 'current';
            this.history$ = null;
            this.historyOf = null;
            this.storedSubscription?.unsubscribe();
            this.storedSubscription = this.progress.answers$(this.videoId).subscribe(stored => {
                this.stored = stored;
                this.answers = effectiveAnswers(stored, this.questions());
            });
        }
        this.renderItems(this.questions());
        this.answers = effectiveAnswers(this.stored, this.questions());
        if (this.current !== null && this.current >= this.items.length) {
            this.current = null;
        }
        if (!this.hasHistory()) {
            this.view = 'current';
        } else if (this.view !== 'current') {
            this.loadHistory();
        }
    }

    /** Whether there is more than one version: AI questions editors changed, or questions edited since they were written. */
    hasHistory(): boolean {
        const quiz = this.aids.quiz;

        return !!quiz && quiz.edited && (quiz.origin === 'ai' || quiz.revision > 1);
    }

    setView(view: PartView): void {
        this.view = view;
        if (view !== 'current') {
            this.loadHistory();
        }
    }

    retryHistory(): void {
        this.historyOf = null;
        this.loadHistory();
    }

    /** The AI's questions and the changes since, worked out once for each set of versions. */
    derive(revisions: QuizRevision[]): {original: QuizRevision | null; changes: QuizChanges | null} {
        if (revisions !== this.derivedFrom || !this.derived) {
            this.derivedFrom = revisions;
            this.derived = {original: aiOriginal(revisions), changes: quizChanges(revisions)};
        }

        return this.derived;
    }

    phase(): 'start' | 'question' | 'results' {
        if (this.current !== null && this.items[this.current]) {
            return 'question';
        }

        return this.answeredCount() === this.items.length ? 'results' : 'start';
    }

    answeredCount(): number {
        return this.items.filter(item => this.isAnswered(item)).length;
    }

    scoreOf(): number {
        return score(this.questions(), this.answers);
    }

    isAnswered(item: QuizItem): boolean {
        return item.question.id in this.answers;
    }

    isRight(item: QuizItem): boolean {
        return this.answers[item.question.id] === item.question.answer;
    }

    choiceState(item: QuizItem, index: number): ChoiceState {
        const chosen = this.answers[item.question.id];
        if (chosen === undefined) {
            return null;
        }
        if (index === item.question.answer) {
            return 'correct';
        }

        return index === chosen ? 'wrong' : 'muted';
    }

    letter(index: number): string {
        return CHOICE_LETTERS[index] ?? String(index + 1);
    }

    statsLine(question: QuizQuestion): string | null {
        const stats = question.stats;
        if (!stats || stats.answered < MIN_ANSWERS_FOR_STATS) {
            return null;
        }

        return `${Math.round(stats.correct / stats.answered * 100)}% of ${stats.answered} students got this right.`;
    }

    /** Where Next goes: the following question, else one still unanswered, else the results. */
    nextIndex(): number | null {
        const following = (this.current ?? -1) + 1;
        if (following < this.items.length) {
            return following;
        }
        const unanswered = this.items.findIndex(item => !this.isAnswered(item));

        return unanswered >= 0 ? unanswered : null;
    }

    emptyNote(): string {
        switch (this.aids.generation) {
            case 'pending':
                return 'The AI is still drafting questions. If you add some now, the AI draft will not replace them.';
            case 'failed':
                return 'The AI could not draft questions for this lecture.';
            default:
                return 'There are no questions for this lecture yet.';
        }
    }

    start(): void {
        const unanswered = this.items.findIndex(item => !this.isAnswered(item));
        this.current = unanswered >= 0 ? unanswered : 0;
    }

    open(index: number): void {
        this.current = index;
    }

    showResults(): void {
        this.current = null;
    }

    choose(item: QuizItem, choice: number): void {
        const id = item.question.id;
        if (this.isAnswered(item)) {
            return;
        }
        this.progress.saveAnswers(this.aids.video_id, {...this.answers, [id]: choice});
        this.announcement = choice === item.question.answer
            ? 'Correct.'
            : `Not quite. The answer is ${this.letter(item.question.answer)}.`;

        // Only a first answer counts towards the class stats, so later ones need not be sent.
        if (item.question.mine === null && this.progress.claimSend(this.aids.video_id, id)) {
            this.service.answer(this.aids.video_id, id, choice).subscribe();
        }
    }

    next(): void {
        this.current = this.nextIndex();
        this.announcement = '';
    }

    retake(): void {
        this.progress.saveAnswers(this.aids.video_id, {});
        this.current = 0;
        this.announcement = '';
    }

    manageEditors(): void {
        void openEditorsList(this.modalCtrl, this.aids.video_id);
    }

    /** A link that opens this lecture with its quiz ready, for sending to the class. */
    shareLink(): string {
        const url = new URL(location.href);
        url.search = '';
        url.hash = '';
        url.searchParams.set('video', String(this.aids.video_id));
        url.searchParams.set(QUIZ_LINK_PARAM, '1');

        return url.toString();
    }

    async share(): Promise<void> {
        const url = this.shareLink();
        if (typeof navigator.share === 'function') {
            try {
                await navigator.share({title: 'Quiz: ' + this.video.title, url});

                return;
            } catch (error) {
                if ((error as DOMException).name === 'AbortError') {
                    return;
                }
            }
        }
        try {
            await navigator.clipboard.writeText(url);
            this.shareNote = 'Link copied. Anyone who signs in to Flick can open the quiz with it.';
        } catch {
            this.shareNote = 'Copy this link to share the quiz: ' + url;
        }
    }

    async edit(): Promise<void> {
        const modal = await this.modalCtrl.create({
            component: QuizEditorComponent,
            cssClass: 'study-editor-modal',
            backdropDismiss: false,
            componentProps: {
                videoId: this.aids.video_id,
                quiz: this.aids.quiz,
                generation: this.aids.generation,
                duration: this.video.duration ?? null,
                playback: this.playback,
            },
        });
        await modal.present();
    }

    private loadHistory(): void {
        const quiz = this.aids.quiz;
        if (!quiz || this.historyOf === quiz.revision) {
            return;
        }
        this.historyOf = quiz.revision;
        this.history$ = this.service.quizRevisions(this.aids.video_id, quiz.revision).pipe(
            map((revisions): HistoryState<RevisionQuestion[]> => ({status: 'ready', revisions})),
            catchError((failure: SaveFailure) => of<HistoryState<RevisionQuestion[]>>({status: 'error', message: describeFailure(failure)})),
            startWith<HistoryState<RevisionQuestion[]>>({status: 'loading'}),
        );
    }

    private questions(): QuizQuestion[] {
        return this.aids?.quiz?.questions ?? [];
    }

    private renderItems(questions: QuizQuestion[]): void {
        if (questions !== this.renderedFrom) {
            this.renderedFrom = questions;
            this.items = questions.map(question => ({
                question,
                promptHtml: renderBlock(question.prompt),
                promptText: plainText(question.prompt),
                choicesHtml: question.choices.map(choice => renderInline(choice)),
                explanationHtml: question.explanation ? renderBlock(question.explanation) : null,
            }));
        }
    }
}
