import {afterNextRender, Component, ElementRef, inject, Injector, Input, NgZone} from '@angular/core';
import {ActivatedRoute} from '@angular/router';
import {AsyncPipe} from '@angular/common';
import {IonButton, IonCard, IonIcon, IonSpinner, ModalController} from '@ionic/angular/standalone';
import {addIcons} from 'ionicons';
import {chevronDown, chevronUp, expandOutline} from 'ionicons/icons';
import {BehaviorSubject, combineLatest, Observable, of} from 'rxjs';
import {map, switchMap} from 'rxjs/operators';
import {Lecture} from '../man.service';
import {StudyAidsService} from '../study-aids.service';
import {StudyAidsProgressService} from '../study-aids-progress.service';
import {QUIZ_LINK_PARAM, QuizBodyComponent} from './quiz-body.component';
import {openReader} from './study-aids-reader.component';
import {isAiDraft} from '../study-aids/byline';
import {displayed} from '../study-aids/displayed';
import {readCollapsed, writeCollapsed} from '../study-aids/local-store';
import {effectiveAnswers, score} from '../study-aids/quiz';
import {LecturePlayback, QuizPart, StudyAids, StudyAidsState} from '../study-aids/study-aids.model';

interface QuizView {
    video: Lecture;
    status: StudyAidsState['status'];
    aids: StudyAids | null;
    quiz: QuizPart | null;
    total: number;
    answered: number;
    correct: number;
}

/**
 * Practice questions on the lecture, on a card under the video. A shared quiz link opens this
 * card and brings it into view.
 */
@Component({
    selector: 'app-lecture-quiz',
    templateUrl: './lecture-quiz.component.html',
    styleUrls: ['./lecture-quiz.component.scss'],
    imports: [AsyncPipe, IonCard, IonButton, IonIcon, IonSpinner, QuizBodyComponent],
})
export class LectureQuizComponent {
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

    protected collapsed = readCollapsed('quiz');
    protected readonly isAiDraft = isAiDraft;

    /** The lecture a shared quiz link points at, until its quiz has been opened. */
    private linkedVideo: string | null = null;

    protected readonly view$: Observable<QuizView | null> = combineLatest([
        this.video$,
        displayed(this.host.nativeElement, inject(NgZone)),
    ]).pipe(
        switchMap(([video, shown]) => video?.id && shown
            ? combineLatest([this.service.watch(video.id), this.progress.answers$(video.id)])
                .pipe(map(([state, stored]) => this.toView(video, state, stored)))
            : of(null)),
    );

    constructor() {
        addIcons({chevronDown, chevronUp, expandOutline});
        const query = inject(ActivatedRoute, {optional: true})?.snapshot.queryParamMap;
        if (query?.has(QUIZ_LINK_PARAM)) {
            this.linkedVideo = query.get('video');
        }
    }

    shows(view: QuizView): boolean {
        if (view.status !== 'ready') {
            return view.status !== 'unavailable';
        }

        return view.total > 0 || !!view.aids?.can_edit || (view.aids?.generation === 'pending' && !view.quiz);
    }

    toggle(): void {
        this.collapsed = !this.collapsed;
        writeCollapsed('quiz', this.collapsed);
    }

    read(view: QuizView): void {
        void openReader(this.modalCtrl, view.video, this.playback, 'quiz');
    }

    seek(seconds: number): void {
        this.playback?.seek(seconds);
    }

    retry(view: QuizView): void {
        this.service.refresh(view.video.id as number);
    }

    private toView(video: Lecture, state: StudyAidsState, stored: Record<string, number> | null): QuizView {
        const aids = state.status === 'ready' ? state.aids : null;
        const quiz = aids?.quiz ?? null;
        const questions = quiz?.questions ?? [];
        const answers = effectiveAnswers(stored, questions);
        if (this.linkedVideo === String(video.id) && questions.length) {
            this.linkedVideo = null;
            this.collapsed = false;
            afterNextRender(() => this.host.nativeElement.scrollIntoView({behavior: 'smooth', block: 'start'}), {injector: this.injector});
        }

        return {
            video,
            status: state.status,
            aids,
            quiz,
            total: questions.length,
            answered: questions.filter(question => question.id in answers).length,
            correct: score(questions, answers),
        };
    }
}
