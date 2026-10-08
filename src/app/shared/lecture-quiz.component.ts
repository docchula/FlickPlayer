import {afterNextRender, Component, ElementRef, inject, Injector, Input, NgZone} from '@angular/core';
import {ActivatedRoute} from '@angular/router';
import {AsyncPipe} from '@angular/common';
import {IonButton, IonCard, IonIcon, IonSpinner, ModalController} from '@ionic/angular/standalone';
import {addIcons} from 'ionicons';
import {
    checkmarkCircle,
    chevronDown,
    chevronUp,
    closeCircle,
    createOutline,
    peopleOutline,
    playCircleOutline,
    refreshOutline,
    shareSocialOutline,
} from 'ionicons/icons';
import {BehaviorSubject, combineLatest, Observable, of} from 'rxjs';
import {map, switchMap} from 'rxjs/operators';
import {Lecture} from '../man.service';
import {StudyAidsService} from '../study-aids.service';
import {RichTextComponent} from './rich-text.component';
import {QuizEditorComponent} from './quiz-editor.component';
import {openEditorsList} from './study-aids-editors.component';
import {formatClock, plainText, renderBlock, renderInline} from '../study-aids/checklist';
import {byline, isAiDraft} from '../study-aids/byline';
import {displayed} from '../study-aids/displayed';
import {readAnswers, readCollapsed, writeAnswers, writeCollapsed} from '../study-aids/local-store';
import {CHOICE_LETTERS, score} from '../study-aids/quiz';
import {LecturePlayback, QuizPart, QuizQuestion, StudyAids, StudyAidsState} from '../study-aids/study-aids.model';

/** Fewer answers than this say nothing about how hard a question is. */
const MIN_ANSWERS_FOR_STATS = 5;

/** `?video=…&quiz=1` opens the lecture with its quiz ready, which is what a shared link sends. */
const QUIZ_LINK_PARAM = 'quiz';

interface QuizItem {
    question: QuizQuestion;
    promptHtml: string;
    promptText: string;
    choicesHtml: string[];
    explanationHtml: string | null;
}

interface QuizView {
    videoId: number;
    title: string;
    duration: number | null;
    status: StudyAidsState['status'];
    aids: StudyAids | null;
    quiz: QuizPart | null;
    items: QuizItem[];
}

type ChoiceState = 'correct' | 'wrong' | 'muted' | null;

/**
 * Practice questions on the lecture, under the video: one at a time, with the answer, the
 * explanation and how the class did shown as soon as the reader picks a choice.
 */
@Component({
    selector: 'app-lecture-quiz',
    templateUrl: './lecture-quiz.component.html',
    styleUrls: ['./lecture-quiz.component.scss'],
    imports: [AsyncPipe, IonCard, IonButton, IonIcon, IonSpinner, RichTextComponent],
})
export class LectureQuizComponent {
    private service = inject(StudyAidsService);
    private modalCtrl = inject(ModalController);
    private host = inject<ElementRef<HTMLElement>>(ElementRef);
    private injector = inject(Injector);

    private readonly video$ = new BehaviorSubject<Lecture | null>(null);

    @Input() set video(video: Lecture | null) {
        this.video$.next(video);
    }

    @Input() playback: LecturePlayback | null = null;

    protected collapsed = readCollapsed('quiz');
    /** This attempt's answers, by question id. */
    protected answers: Record<string, number> = {};
    /** The open question; null shows the start or, once everything is answered, the results. */
    protected current: number | null = null;
    /** Read out by screen readers when an answer is checked. */
    protected announcement = '';
    /** What happened to the last shared link. */
    protected shareNote = '';
    protected readonly byline = byline;
    protected readonly isAiDraft = isAiDraft;
    protected readonly formatClock = formatClock;

    private sessionVideo: number | null = null;
    private sessionLoaded = false;
    private sent = new Set<string>();
    private renderedFrom: QuizQuestion[] | null = null;
    private rendered: QuizItem[] = [];
    /** The lecture a shared quiz link points at, until its quiz has been opened. */
    private linkedVideo: string | null = null;

    protected readonly view$: Observable<QuizView | null> = combineLatest([
        this.video$,
        displayed(this.host.nativeElement, inject(NgZone)),
    ]).pipe(
        switchMap(([video, shown]) => video?.id && shown
            ? this.service.watch(video.id).pipe(map(state => this.toView(video, state)))
            : of(null)),
    );

    constructor() {
        addIcons({checkmarkCircle, chevronDown, chevronUp, closeCircle, createOutline, peopleOutline, playCircleOutline, refreshOutline, shareSocialOutline});
        const query = inject(ActivatedRoute, {optional: true})?.snapshot.queryParamMap;
        if (query?.has(QUIZ_LINK_PARAM)) {
            this.linkedVideo = query.get('video');
        }
    }

    shows(view: QuizView): boolean {
        if (view.status !== 'ready') {
            return view.status !== 'unavailable';
        }

        return view.items.length > 0 || !!view.aids?.can_edit || (view.aids?.generation === 'pending' && !view.quiz);
    }

    phase(view: QuizView): 'start' | 'question' | 'results' {
        if (this.current !== null && view.items[this.current]) {
            return 'question';
        }

        return this.answeredCount(view) === view.items.length ? 'results' : 'start';
    }

    answeredCount(view: QuizView): number {
        return view.items.filter(item => item.question.id in this.answers).length;
    }

    scoreOf(view: QuizView): number {
        return score(view.items.map(item => item.question), this.answers);
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
    nextIndex(view: QuizView): number | null {
        const following = (this.current ?? -1) + 1;
        if (following < view.items.length) {
            return following;
        }
        const unanswered = view.items.findIndex(item => !this.isAnswered(item));

        return unanswered >= 0 ? unanswered : null;
    }

    emptyNote(aids: StudyAids): string {
        switch (aids.generation) {
            case 'pending':
                return 'The AI is still drafting questions. If you add some now, the AI draft will not replace them.';
            case 'failed':
                return 'The AI could not draft questions for this lecture.';
            default:
                return 'There are no questions for this lecture yet.';
        }
    }

    toggle(): void {
        this.collapsed = !this.collapsed;
        writeCollapsed('quiz', this.collapsed);
    }

    start(view: QuizView): void {
        const unanswered = view.items.findIndex(item => !this.isAnswered(item));
        this.current = unanswered >= 0 ? unanswered : 0;
    }

    open(index: number): void {
        this.current = index;
    }

    showResults(): void {
        this.current = null;
    }

    choose(view: QuizView, item: QuizItem, choice: number): void {
        const id = item.question.id;
        if (this.isAnswered(item)) {
            return;
        }
        this.answers = {...this.answers, [id]: choice};
        writeAnswers(view.videoId, this.answers);
        this.announcement = choice === item.question.answer
            ? 'Correct.'
            : `Not quite. The answer is ${this.letter(item.question.answer)}.`;

        // Only a first answer counts towards the class stats, so later ones need not be sent.
        if (item.question.mine === null && !this.sent.has(id)) {
            this.sent.add(id);
            this.service.answer(view.videoId, id, choice).subscribe();
        }
    }

    next(view: QuizView): void {
        this.current = this.nextIndex(view);
        this.announcement = '';
    }

    retake(view: QuizView): void {
        this.answers = {};
        writeAnswers(view.videoId, this.answers);
        this.current = 0;
        this.announcement = '';
    }

    seek(seconds: number): void {
        this.playback?.seek(seconds);
    }

    retry(view: QuizView): void {
        this.service.refresh(view.videoId);
    }

    manageEditors(view: QuizView): void {
        void openEditorsList(this.modalCtrl, view.videoId);
    }

    /** A link that opens this lecture with its quiz ready, for sending to the class. */
    shareLink(view: QuizView): string {
        const url = new URL(location.href);
        url.search = '';
        url.hash = '';
        url.searchParams.set('video', String(view.videoId));
        url.searchParams.set(QUIZ_LINK_PARAM, '1');

        return url.toString();
    }

    async share(view: QuizView): Promise<void> {
        const url = this.shareLink(view);
        if (typeof navigator.share === 'function') {
            try {
                await navigator.share({title: 'Quiz: ' + view.title, url});

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

    async edit(view: QuizView): Promise<void> {
        if (!view.aids) {
            return;
        }
        const modal = await this.modalCtrl.create({
            component: QuizEditorComponent,
            cssClass: 'study-editor-modal',
            backdropDismiss: false,
            componentProps: {
                videoId: view.videoId,
                quiz: view.quiz,
                generation: view.aids.generation,
                duration: view.duration,
                playback: this.playback,
            },
        });
        await modal.present();
    }

    private toView(video: Lecture, state: StudyAidsState): QuizView {
        const videoId = video.id as number;
        if (videoId !== this.sessionVideo) {
            this.sessionVideo = videoId;
            this.sessionLoaded = false;
            this.answers = {};
            this.current = null;
            this.announcement = '';
            this.shareNote = '';
            this.sent.clear();
        }
        const aids = state.status === 'ready' ? state.aids : null;
        const quiz = aids?.quiz ?? null;
        const items = quiz ? this.itemsFor(quiz.questions) : [];
        if (quiz && !this.sessionLoaded) {
            // A reader who answered on another device starts from those first answers.
            this.answers = readAnswers(videoId) ?? Object.fromEntries(quiz.questions
                .filter(question => question.mine !== null)
                .map(question => [question.id, question.mine as number]));
            this.sessionLoaded = true;
        }
        if (this.current !== null && this.current >= items.length) {
            this.current = null;
        }
        if (this.linkedVideo === String(videoId) && items.length) {
            this.linkedVideo = null;
            this.collapsed = false;
            afterNextRender(() => this.host.nativeElement.scrollIntoView({behavior: 'smooth', block: 'start'}), {injector: this.injector});
        }

        return {videoId, title: video.title, duration: video.duration ?? null, status: state.status, aids, quiz, items};
    }

    private itemsFor(questions: QuizQuestion[]): QuizItem[] {
        if (questions !== this.renderedFrom) {
            this.renderedFrom = questions;
            this.rendered = questions.map(question => ({
                question,
                promptHtml: renderBlock(question.prompt),
                promptText: plainText(question.prompt),
                choicesHtml: question.choices.map(choice => renderInline(choice)),
                explanationHtml: question.explanation ? renderBlock(question.explanation) : null,
            }));
        }

        return this.rendered;
    }
}
