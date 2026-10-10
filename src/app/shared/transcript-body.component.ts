import {Component, ElementRef, EventEmitter, inject, Input, NgZone, OnChanges, OnDestroy, Output} from '@angular/core';
import {AsyncPipe} from '@angular/common';
import {IonButton, IonIcon, IonSpinner} from '@ionic/angular';
import {addIcons} from 'ionicons';
import {locateOutline, play} from 'ionicons/icons';
import {Observable} from 'rxjs';
import {tap} from 'rxjs/operators';
import {StudyAidsService} from '../study-aids.service';
import {formatClock} from '../study-aids/checklist';
import {LecturePlayback, TranscriptParagraph, TranscriptState} from '../study-aids/study-aids.model';

/** The paragraph being spoken at `seconds`, or -1 before the first. */
export function paragraphAt(paragraphs: readonly TranscriptParagraph[], seconds: number): number {
    let found = -1;
    paragraphs.forEach((paragraph, i) => {
        if (paragraph.time <= seconds) {
            found = i;
        }
    });

    return found;
}

/**
 * The AI's word-for-word transcript of the lecture, each paragraph with the time it starts, which
 * plays the lecture from there. The paragraph being spoken is marked as the lecture plays.
 */
@Component({
    selector: 'app-transcript-body',
    templateUrl: './transcript-body.component.html',
    styleUrls: ['./transcript-body.component.scss'],
    imports: [AsyncPipe, IonButton, IonIcon, IonSpinner],
    host: {'[class.reader]': 'reader'},
})
export class TranscriptBodyComponent implements OnChanges, OnDestroy {
    private service = inject(StudyAidsService);
    private host = inject<ElementRef<HTMLElement>>(ElementRef);
    private zone = inject(NgZone);

    @Input({required: true}) videoId: number;
    @Input() playback: LecturePlayback | null = null;
    /** Laid out for the reading window rather than the card. */
    @Input() reader = false;
    @Output() seek = new EventEmitter<number>();

    protected state$: Observable<TranscriptState>;
    /** The paragraph being spoken, or -1. */
    protected current = -1;
    /** Whether the list scrolls along as the lecture plays. */
    protected following = false;
    protected readonly formatClock = formatClock;

    private paragraphs: TranscriptParagraph[] = [];
    private shownFor: number | null = null;
    private readonly timer: ReturnType<typeof setInterval>;

    constructor() {
        addIcons({locateOutline, play});
        // Checked outside Angular, which only hears about it when another paragraph starts.
        this.timer = this.zone.runOutsideAngular(() => setInterval(() => this.follow(), 1000));
    }

    ngOnChanges(): void {
        if (this.videoId !== this.shownFor) {
            this.shownFor = this.videoId;
            this.current = -1;
            this.state$ = this.service.transcript(this.videoId).pipe(
                tap(state => this.paragraphs = state.status === 'ready' ? state.paragraphs : []),
            );
        }
    }

    ngOnDestroy(): void {
        clearInterval(this.timer);
    }

    retry(): void {
        this.service.retryTranscript(this.videoId);
    }

    toggleFollowing(): void {
        this.following = !this.following;
        if (this.following) {
            this.showNow();
        }
    }

    /** Brings the paragraph being spoken into view. */
    showNow(): void {
        this.follow();
        this.scrollTo(this.current);
    }

    /** Brings the part of the lecture at `seconds` into view, for the reading window's list of sections. */
    scrollToTime(seconds: number): void {
        this.scrollTo(Math.max(0, paragraphAt(this.paragraphs, seconds)));
    }

    private follow(): void {
        if (!this.playback || !this.paragraphs.length) {
            return;
        }
        const index = paragraphAt(this.paragraphs, this.playback.currentTime());
        if (index !== this.current) {
            this.zone.run(() => this.current = index);
            if (this.following) {
                this.scrollTo(index);
            }
        }
    }

    private scrollTo(index: number): void {
        const paragraph = this.host.nativeElement.querySelectorAll<HTMLElement>('.transcript-paragraph')[index];
        if (!paragraph) {
            return;
        }
        if (this.reader) {
            paragraph.scrollIntoView({behavior: 'smooth', block: 'center'});

            return;
        }
        // On the card only the list scrolls, so the video above stays in view.
        const list = this.host.nativeElement.querySelector<HTMLElement>('.transcript');
        list?.scrollTo({top: paragraph.offsetTop - list.clientHeight / 3, behavior: 'smooth'});
    }
}
