import {Component, ElementRef, inject, Input, NgZone} from '@angular/core';
import {AsyncPipe} from '@angular/common';
import {IonButton, IonCard, IonIcon, IonSpinner, ModalController} from '@ionic/angular/standalone';
import {addIcons} from 'ionicons';
import {chevronDown, chevronUp, expandOutline} from 'ionicons/icons';
import {BehaviorSubject, combineLatest, Observable, of} from 'rxjs';
import {map, switchMap} from 'rxjs/operators';
import {Lecture} from '../man.service';
import {StudyAidsService} from '../study-aids.service';
import {StudyAidsProgressService} from '../study-aids-progress.service';
import {SummaryBodyComponent} from './summary-body.component';
import {openReader} from './study-aids-reader.component';
import {checklistFor} from '../study-aids/checklist';
import {isAiDraft} from '../study-aids/byline';
import {displayed} from '../study-aids/displayed';
import {readCollapsed, writeCollapsed} from '../study-aids/local-store';
import {LecturePlayback, StudyAids, StudyAidsState, SummaryPart} from '../study-aids/study-aids.model';

interface SummaryView {
    video: Lecture;
    status: StudyAidsState['status'];
    aids: StudyAids | null;
    summary: SummaryPart | null;
    points: number;
    reviewed: number;
}

/**
 * The lecture's summary as a checklist, on a card under the video. Shows nothing for a lecture
 * that has no summary, unless the reader can write one.
 */
@Component({
    selector: 'app-lecture-summary',
    templateUrl: './lecture-summary.component.html',
    styleUrls: ['./lecture-summary.component.scss'],
    imports: [AsyncPipe, IonCard, IonButton, IonIcon, IonSpinner, SummaryBodyComponent],
})
export class LectureSummaryComponent {
    private service = inject(StudyAidsService);
    private progress = inject(StudyAidsProgressService);
    private modalCtrl = inject(ModalController);

    private readonly video$ = new BehaviorSubject<Lecture | null>(null);

    @Input() set video(video: Lecture | null) {
        this.video$.next(video);
    }

    @Input() playback: LecturePlayback | null = null;

    protected collapsed = readCollapsed('summary');
    protected readonly isAiDraft = isAiDraft;

    protected readonly view$: Observable<SummaryView | null> = combineLatest([
        this.video$,
        displayed(inject<ElementRef<HTMLElement>>(ElementRef).nativeElement, inject(NgZone)),
    ]).pipe(
        switchMap(([video, shown]) => video?.id && shown
            ? combineLatest([this.service.watch(video.id), this.progress.ticks$(video.id)])
                .pipe(map(([state, ticked]) => this.toView(video, state, ticked)))
            : of(null)),
    );

    constructor() {
        addIcons({chevronDown, chevronUp, expandOutline});
    }

    shows(view: SummaryView): boolean {
        if (view.status !== 'ready') {
            return view.status !== 'unavailable';
        }

        return !!view.summary || !!view.aids?.can_edit || view.aids?.generation === 'pending';
    }

    toggle(): void {
        this.collapsed = !this.collapsed;
        writeCollapsed('summary', this.collapsed);
    }

    read(view: SummaryView): void {
        void openReader(this.modalCtrl, view.video, this.playback, 'summary');
    }

    seek(seconds: number): void {
        this.playback?.seek(seconds);
    }

    retry(view: SummaryView): void {
        this.service.refresh(view.video.id as number);
    }

    private toView(video: Lecture, state: StudyAidsState, ticked: ReadonlySet<string>): SummaryView {
        const aids = state.status === 'ready' ? state.aids : null;
        const summary = aids?.summary ?? null;
        const pointKeys = summary ? checklistFor(summary.markdown).pointKeys : [];

        return {
            video,
            status: state.status,
            aids,
            summary,
            points: pointKeys.length,
            reviewed: pointKeys.filter(key => ticked.has(key)).length,
        };
    }
}
