import {Component, ElementRef, EventEmitter, inject, Input, NgZone, OnChanges, OnDestroy, Output} from '@angular/core';
import {AsyncPipe} from '@angular/common';
import {IonButton, IonIcon, IonSpinner} from '@ionic/angular';
import {addIcons} from 'ionicons';
import {downloadOutline, locateOutline, play} from 'ionicons/icons';
import {Observable} from 'rxjs';
import {tap} from 'rxjs/operators';
import {Lecture} from '../man.service';
import {StudyAidsService} from '../study-aids.service';
import {formatClock, formatStamp} from '../study-aids/checklist';
import {LecturePlayback, TranscriptParagraph, TranscriptState} from '../study-aids/study-aids.model';

/** A paragraph as the transcript shows it: FlickMan's stamped lines, grouped back together for reading. */
export interface ReadingParagraph {
    time: number;
    /** Each line keeps its place in the transcript, to mark the one being spoken. */
    lines: {index: number; time: number; text: string}[];
}

/** Lines stamped one by one are grouped into paragraphs of about this long; longer lines stand alone. */
const PARAGRAPH_SECONDS = 45;
const PARAGRAPH_CHARACTERS = 600;

export function readingParagraphs(lines: readonly TranscriptParagraph[]): ReadingParagraph[] {
    const paragraphs: ReadingParagraph[] = [];
    let length = 0;
    lines.forEach((line, index) => {
        const last = paragraphs[paragraphs.length - 1];
        const entry = {index, time: line.time, text: line.text};
        if (last && line.time - last.time < PARAGRAPH_SECONDS && length + line.text.length <= PARAGRAPH_CHARACTERS) {
            last.lines.push(entry);
            length += line.text.length;
        } else {
            paragraphs.push({time: line.time, lines: [entry]});
            length = line.text.length;
        }
    });

    return paragraphs;
}

/** The line being spoken at `seconds`, or -1 before the first. */
export function paragraphAt(paragraphs: readonly TranscriptParagraph[], seconds: number): number {
    let found = -1;
    paragraphs.forEach((paragraph, i) => {
        if (paragraph.time <= seconds) {
            found = i;
        }
    });

    return found;
}

/** The transcript as a text file: the lecture, then each paragraph after the time it starts. */
export function transcriptText(paragraphs: readonly ReadingParagraph[], video: Pick<Lecture, 'title' | 'lecturer'>): string {
    const head = [video.title, video.lecturer, 'Transcribed word for word by AI, which can mishear names and terms.']
        .map(line => line?.trim())
        .filter(Boolean);
    const body = paragraphs.map(paragraph => `[${formatStamp(paragraph.time)}] ${paragraph.lines.map(line => line.text).join(' ')}`);

    return [head.join('\n'), ...body].join('\n\n') + '\n';
}

/** Named after the lecture, without the characters file systems refuse, and short enough for any of them. */
export function transcriptFileName(title: string): string {
    const name = title.replace(/[\\/:*?"<>|\s]+/g, ' ').slice(0, 75).replace(/^[\s.]+|[\s.]+$/g, '');

    return `${name || 'Lecture'} - Transcript.txt`;
}

/**
 * The AI's word-for-word transcript of the lecture, each paragraph with the time it starts, which
 * plays the lecture from there, as does each stamped line in it. The line being spoken is marked
 * as the lecture plays.
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
    @Input({required: true}) video: Lecture;
    @Input() playback: LecturePlayback | null = null;
    /** Laid out for the reading window rather than the card. */
    @Input() reader = false;
    @Output() seek = new EventEmitter<number>();

    protected state$: Observable<TranscriptState>;
    protected reading: ReadingParagraph[] = [];
    /** The line being spoken, or -1. */
    protected current = -1;
    /** Whether the list scrolls along as the lecture plays. */
    protected following = false;
    protected readonly formatClock = formatClock;

    private paragraphs: TranscriptParagraph[] = [];
    private shownFor: number | null = null;
    private readonly timer: ReturnType<typeof setInterval>;

    constructor() {
        addIcons({downloadOutline, locateOutline, play});
        // Checked outside Angular, which only hears about it when another paragraph starts.
        this.timer = this.zone.runOutsideAngular(() => setInterval(() => this.follow(), 1000));
    }

    ngOnChanges(): void {
        if (this.videoId !== this.shownFor) {
            this.shownFor = this.videoId;
            this.current = -1;
            this.state$ = this.service.transcript(this.videoId).pipe(
                tap(state => {
                    this.paragraphs = state.status === 'ready' ? state.paragraphs : [];
                    this.reading = readingParagraphs(this.paragraphs);
                }),
            );
        }
    }

    ngOnDestroy(): void {
        clearInterval(this.timer);
    }

    retry(): void {
        this.service.retryTranscript(this.videoId);
    }

    download(): void {
        // The byte order mark keeps editors that guess the encoding from misreading the Thai.
        const file = new Blob(['\uFEFF' + transcriptText(this.reading, this.video)], {type: 'text/plain;charset=utf-8'});
        const link = document.createElement('a');
        link.href = URL.createObjectURL(file);
        link.download = transcriptFileName(this.video.title);
        link.click();
        // Some browsers only start reading the file after the click has returned.
        this.zone.runOutsideAngular(() => setTimeout(() => URL.revokeObjectURL(link.href), 60_000));
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

    /** Whether the line being spoken is in the paragraph. */
    holdsCurrent(paragraph: ReadingParagraph): boolean {
        return paragraph.lines.some(line => line.index === this.current);
    }

    private scrollTo(line: number): void {
        const index = this.reading.findIndex(paragraph => paragraph.lines.some(entry => entry.index === line));
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
