import {afterNextRender, Component, ElementRef, inject, Injector, Input, NgZone} from '@angular/core';
import {ActivatedRoute} from '@angular/router';
import {AsyncPipe} from '@angular/common';
import {IonButton, IonCard, IonIcon, IonLabel, IonSegment, IonSegmentButton, IonSpinner, ModalController} from '@ionic/angular';
import {addIcons} from 'ionicons';
import {chevronDown, chevronUp, expandOutline} from 'ionicons/icons';
import {BehaviorSubject, combineLatest, Observable, of} from 'rxjs';
import {map, switchMap} from 'rxjs/operators';
import {Lecture} from '../man.service';
import {StudyAidsService} from '../study-aids.service';
import {StudyAidsProgressService} from '../study-aids-progress.service';
import {SummaryBodyComponent} from './summary-body.component';
import {TranscriptBodyComponent} from './transcript-body.component';
import {QUIZ_LINK_PARAM, QuizBodyComponent} from './quiz-body.component';
import {openReader} from './study-aids-reader.component';
import {checklistFor} from '../study-aids/checklist';
import {isAiDraft, verifiedState} from '../study-aids/byline';
import {displayed} from '../study-aids/displayed';
import {readCollapsed, readTab, writeCollapsed, writeTab} from '../study-aids/local-store';
import {effectiveAnswers, score} from '../study-aids/quiz';
import {isStudyTab, StudyTab, studyTabs, TAB_LABELS} from '../study-aids/tabs';
import {LecturePlayback, StudyAids, StudyAidsState} from '../study-aids/study-aids.model';

interface CardView {
    video: Lecture;
    status: StudyAidsState['status'];
    aids: StudyAids | null;
    tabs: StudyTab[];
    points: number;
    reviewed: number;
    questions: number;
    answered: number;
    correct: number;
}

/**
 * The lecture's summary, transcription and quiz, in tabs on one card under the video. A shared quiz
 * link opens the card on its quiz and brings it into view.
 */
@Component({
    selector: 'app-lecture-study-aids',
    templateUrl: './lecture-study-aids.component.html',
    styleUrls: ['./lecture-study-aids.component.scss'],
    imports: [
        AsyncPipe,
        IonCard,
        IonButton,
        IonIcon,
        IonLabel,
        IonSegment,
        IonSegmentButton,
        IonSpinner,
        SummaryBodyComponent,
        TranscriptBodyComponent,
        QuizBodyComponent,
    ],
})
export class LectureStudyAidsComponent {
    private service = inject(StudyAidsService);
    private progress = inject(StudyAidsProgressService);
    private modalCtrl = inject(ModalController);
    private host = inject<ElementRef<HTMLElement>>(ElementRef);
    private injector = inject(Injector);

    private readonly video$ = new BehaviorSubject<Lecture | null>(null);

    @Input() set video(video: Lecture | null) {
        this.video$.next(video);
    }

    @Input() playback: LecturePlayback | null = null;

    protected collapsed = readCollapsed();
    protected tab: StudyTab = readTab();
    protected readonly tabLabels = TAB_LABELS;

    /** The lecture a shared quiz link points at, until its quiz has been opened. */
    private linkedVideo: string | null = null;

    protected readonly view$: Observable<CardView | null> = combineLatest([
        this.video$,
        displayed(this.host.nativeElement, inject(NgZone)),
    ]).pipe(
        switchMap(([video, shown]) => video?.id && shown
            ? combineLatest([this.service.watch(video.id), this.progress.ticks$(video.id), this.progress.answers$(video.id)])
                .pipe(map(([state, ticked, answers]) => this.toView(video, state, ticked, answers)))
            : of(null)),
    );

    constructor() {
        addIcons({chevronDown, chevronUp, expandOutline});
        const query = inject(ActivatedRoute, {optional: true})?.snapshot.queryParamMap;
        if (query?.has(QUIZ_LINK_PARAM)) {
            this.linkedVideo = query.get('video');
        }
    }

    shows(view: CardView): boolean {
        return view.status === 'ready' ? view.tabs.length > 0 : view.status !== 'unavailable';
    }

    /** The chosen tab, or the first with something in it when the chosen one is empty for this lecture. */
    activeTab(view: CardView): StudyTab {
        return view.tabs.includes(this.tab) ? this.tab : view.tabs[0] ?? 'summary';
    }

    onTab(event: Event): void {
        const value = (event as CustomEvent<{value: unknown}>).detail.value;
        if (isStudyTab(value)) {
            this.tab = value;
            writeTab(value);
        }
    }

    /** "AI draft" or "Verified", for the summary or the quiz on show. */
    badge(view: CardView): {text: string; verified: boolean} | null {
        const tab = this.activeTab(view);
        const part = tab === 'summary' ? view.aids?.summary : tab === 'quiz' && view.questions ? view.aids?.quiz : null;
        if (!part) {
            return null;
        }
        if (verifiedState(part) === 'current') {
            return {text: 'Verified', verified: true};
        }

        return isAiDraft(part) ? {text: 'AI draft', verified: false} : null;
    }

    /** How far the reader has got with the tab on show. */
    progressOf(view: CardView): string | null {
        switch (this.activeTab(view)) {
            case 'summary':
                return view.points ? `${view.reviewed}/${view.points} ticked` : null;
            case 'quiz':
                if (!view.questions) {
                    return null;
                }

                return view.answered === view.questions
                    ? `${view.correct}/${view.questions} correct`
                    : `${view.questions} ${view.questions === 1 ? 'question' : 'questions'}`;
            default:
                return null;
        }
    }

    toggle(): void {
        this.collapsed = !this.collapsed;
        writeCollapsed(this.collapsed);
    }

    read(view: CardView): void {
        void openReader(this.modalCtrl, view.video, this.playback, this.activeTab(view));
    }

    seek(seconds: number): void {
        this.playback?.seek(seconds);
    }

    retry(view: CardView): void {
        this.service.refresh(view.video.id as number);
    }

    private toView(video: Lecture, state: StudyAidsState, ticked: ReadonlySet<string>, stored: Record<string, number> | null): CardView {
        const aids = state.status === 'ready' ? state.aids : null;
        const pointKeys = aids?.summary ? checklistFor(aids.summary.markdown).pointKeys : [];
        const questions = aids?.quiz?.questions ?? [];
        const answers = effectiveAnswers(stored, questions);
        if (this.linkedVideo === String(video.id) && questions.length) {
            this.linkedVideo = null;
            this.collapsed = false;
            this.tab = 'quiz';
            afterNextRender(() => this.host.nativeElement.scrollIntoView({behavior: 'smooth', block: 'start'}), {injector: this.injector});
        }

        return {
            video,
            status: state.status,
            aids,
            tabs: aids ? studyTabs(aids) : [],
            points: pointKeys.length,
            reviewed: pointKeys.filter(key => ticked.has(key)).length,
            questions: questions.length,
            answered: questions.filter(question => question.id in answers).length,
            correct: score(questions, answers),
        };
    }
}
