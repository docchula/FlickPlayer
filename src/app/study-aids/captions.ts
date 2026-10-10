import type Player from 'video.js/dist/types/player';
import type Button from 'video.js/dist/types/button';
import type Component from 'video.js/dist/types/component';
import {Subscription} from 'rxjs';
import {filter, take} from 'rxjs/operators';
import {StudyAidsService} from '../study-aids.service';
import {words} from './diff';
import {readCaptions, writeCaptions} from './local-store';
import {TranscriptParagraph} from './study-aids.model';

/*
 * Captions from the AI transcript. FlickMan only knows when each paragraph starts (they are at most
 * a minute apart), so a paragraph is cut into two-line captions shown one after another over its
 * time, each for as long as its share of the words. They follow the lecture closely but not exactly.
 */

export interface Cue {
    start: number;
    end: number;
    text: string;
}

/** About two lines across the player on a phone held sideways. */
const CAPTION_LENGTH = 84;
/** Roughly how fast lecturers speak, to tell when a paragraph is followed by a pause. */
const LETTERS_PER_SECOND = 14;
const MIN_PARAGRAPH_SECONDS = 2;

/** Thai vowel and tone marks sit above or below a letter and take no room of their own. */
const THAI_MARKS = /[ัิ-ฺ็-๎]/g;

function width(text: string): number {
    return text.replace(THAI_MARKS, '').length;
}

function weight(text: string): number {
    return width(text.replace(/\s+/g, ''));
}

/** A run of Thai with no spaces, longer than a caption, broken between words. */
function splitRun(run: string): string[] {
    const parts: string[] = [];
    let current = '';
    for (const word of words(run)) {
        if (current && width(current + word) > CAPTION_LENGTH) {
            parts.push(current);
            current = '';
        }
        current += word;
    }

    return current ? [...parts, current] : parts;
}

/** A paragraph cut into captions between words, ending one at a full stop when it is already half full. */
export function splitCaptions(text: string): string[] {
    const pieces = text.replace(/\s+/g, ' ').trim().split(' ')
        .filter(Boolean)
        .flatMap(piece => width(piece) > CAPTION_LENGTH ? splitRun(piece) : [piece]);
    const captions: string[] = [];
    let current = '';
    for (const piece of pieces) {
        const joined = current ? current + ' ' + piece : piece;
        if (current && width(joined) > CAPTION_LENGTH) {
            captions.push(current);
            current = piece;
        } else {
            current = joined;
        }
        if (/[.!?]$/.test(current) && width(current) >= CAPTION_LENGTH / 2) {
            captions.push(current);
            current = '';
        }
    }

    return current ? [...captions, current] : captions;
}

export function buildCues(paragraphs: readonly TranscriptParagraph[], duration: number | null): Cue[] {
    // Where two recorded pieces overlap, a stamp can go back in time: such a paragraph runs on from the one before.
    const spans: TranscriptParagraph[] = [];
    for (const paragraph of paragraphs) {
        const last = spans[spans.length - 1];
        if (last && paragraph.time <= last.time) {
            last.text += ' ' + paragraph.text;
        } else {
            spans.push({...paragraph});
        }
    }

    return spans.flatMap((span, i) => {
        const captions = splitCaptions(span.text);
        const total = captions.reduce((sum, caption) => sum + weight(caption), 0) || 1;
        const next = spans[i + 1]?.time ?? (duration && duration > span.time ? duration : null);
        // Speech fills its paragraph unless a long pause follows, which is left without a caption.
        const spoken = Math.max(MIN_PARAGRAPH_SECONDS, total / LETTERS_PER_SECOND * 2);
        const length = next === null ? spoken : Math.min(next - span.time, spoken);
        let start = span.time;

        return captions.map(caption => {
            const end = start + weight(caption) / total * length;
            const cue = {start, end, text: caption};
            start = end;

            return cue;
        });
    });
}

function vttTime(seconds: number): string {
    const total = Math.max(0, Math.round(seconds * 1000));
    const parts = [Math.floor(total / 3_600_000), Math.floor(total % 3_600_000 / 60_000), Math.floor(total % 60_000 / 1000)];

    return parts.map(part => String(part).padStart(2, '0')).join(':') + '.' + String(total % 1000).padStart(3, '0');
}

export function toWebVtt(cues: readonly Cue[]): string {
    const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    return 'WEBVTT\n\n' + cues.map(cue => `${vttTime(cue.start)} --> ${vttTime(cue.end)}\n${escape(cue.text)}`).join('\n\n') + '\n';
}

/** The captions button in the player's control bar, and the captions it turns on and off. */
export class LectureCaptions {
    private readonly button: Button;
    private readonly icon: HTMLElement | null;
    private on = readCaptions();
    private videoId: number | null = null;
    private duration: number | null = null;
    /** Why captions that are on are not showing. */
    private problem: 'none' | 'failed' | null = null;
    private request: Subscription | null = null;
    private track: object | null = null;
    private url: string | null = null;

    constructor(private readonly player: Player, private readonly service: StudyAidsService) {
        const controlBar = player.getChild('ControlBar') as Component;
        const fullscreen = controlBar.getChild('FullscreenToggle');
        this.button = controlBar.addChild('button', {
            className: 'vjs-captions-toggle',
            clickHandler: () => this.toggle(),
        }, fullscreen ? controlBar.children().indexOf(fullscreen) : undefined) as Button;
        // video.js's own captions glyph, so the button looks like the player's other controls.
        this.icon = this.button.el().querySelector<HTMLElement>('.vjs-icon-placeholder');
        this.icon?.classList.add('vjs-icon-captions');
        this.button.hide();
        this.render();
    }

    /** Offers captions for the lecture now playing, when it has a transcript, and shows them if they are on. */
    show(videoId: number | null, hasTranscript: boolean, duration: number | null): void {
        this.clear();
        this.videoId = videoId && hasTranscript ? videoId : null;
        this.duration = duration;
        this.problem = null;
        if (this.videoId) {
            this.button.show();
            if (this.on) {
                this.load();
            }
        } else {
            this.button.hide();
        }
        this.render();
    }

    dispose(): void {
        this.clear();
    }

    private toggle(): void {
        // Captions that failed to load are tried again rather than turned off.
        this.on = this.problem === 'failed' || !this.on;
        writeCaptions(this.on);
        this.problem = null;
        if (this.on) {
            this.load();
        } else {
            this.clear();
        }
        this.render();
    }

    private load(): void {
        const videoId = this.videoId;
        if (!videoId || this.track || this.request) {
            return;
        }
        this.service.retryTranscript(videoId);
        this.request = this.service.transcript(videoId).pipe(
            filter(state => state.status !== 'loading'),
            take(1),
        ).subscribe(state => {
            this.request = null;
            if (videoId !== this.videoId || !this.on) {
                return;
            }
            if (state.status === 'ready') {
                this.attach(buildCues(state.paragraphs, this.duration ?? (this.player.duration() || null)));
            } else {
                this.problem = state.status === 'none' ? 'none' : 'failed';
            }
            this.render();
        });
    }

    private attach(cues: Cue[]): void {
        this.url = URL.createObjectURL(new Blob([toWebVtt(cues)], {type: 'text/vtt'}));
        // Removed by hand, so a lecture's captions never outlive it whatever the player does with sources.
        const element = this.player.addRemoteTextTrack({kind: 'captions', label: 'AI captions', srclang: 'th', src: this.url}, true);
        (element as unknown as {track: TextTrack}).track.mode = 'showing';
        this.track = element;
    }

    private clear(): void {
        this.request?.unsubscribe();
        this.request = null;
        if (this.track) {
            this.player.removeRemoteTextTrack(this.track);
            this.track = null;
        }
        if (this.url) {
            URL.revokeObjectURL(this.url);
            this.url = null;
        }
    }

    private render(): void {
        const showing = this.on && !this.problem;
        this.button.el().setAttribute('aria-pressed', String(showing));
        // Dimmed while off.
        if (this.icon) {
            this.icon.style.opacity = showing ? '' : '0.5';
        }
        this.button.controlText(
            this.problem === 'none' ? 'This lecture has no captions'
                : this.problem === 'failed' ? 'Captions could not be loaded. Try again'
                    : showing ? 'Turn captions off' : 'Turn captions on',
        );
    }
}
