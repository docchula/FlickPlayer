import {inject, Injectable} from '@angular/core';
import {BehaviorSubject, Observable} from 'rxjs';
import {filter, take} from 'rxjs/operators';
import {StudyAidsService} from './study-aids.service';
import {markTicksUnsynced, readAnswers, readTicks, ticksUnsynced, writeAnswers, writeTicks} from './study-aids/local-store';

/** Ticking several points in a row sends them to FlickMan once. */
const SYNC_DELAY_MS = 1500;

/**
 * What a reader has done with a lecture's summary and quiz. The card under the video and the
 * reading window share it, so ticking or answering in one shows in the other. Ticks are kept on
 * the device at once and on FlickMan shortly after, so the reader's other devices show them too.
 */
@Injectable({
    providedIn: 'root',
})
export class StudyAidsProgressService {
    private service = inject(StudyAidsService);

    private readonly ticks = new Map<number, BehaviorSubject<ReadonlySet<string>>>();
    private readonly answers = new Map<number, BehaviorSubject<Record<string, number> | null>>();
    private readonly sent = new Set<string>();
    /** Lectures whose ticks were matched with FlickMan's on this visit. */
    private readonly matched = new Set<number>();
    private readonly waiting = new Map<number, ReturnType<typeof setTimeout>>();

    ticks$(videoId: number): Observable<ReadonlySet<string>> {
        this.match(videoId);

        return this.tickSubject(videoId).asObservable();
    }

    setTick(videoId: number, key: string, ticked: boolean): void {
        const next = new Set(this.tickSubject(videoId).value);
        if (ticked) {
            next.add(key);
        } else {
            next.delete(key);
        }
        this.saveTicks(videoId, next);
    }

    clearTicks(videoId: number): void {
        this.saveTicks(videoId, new Set());
    }

    /** This device's quiz answers, by question id; null until the quiz is first answered here. */
    answers$(videoId: number): Observable<Record<string, number> | null> {
        return this.answerSubject(videoId).asObservable();
    }

    saveAnswers(videoId: number, answers: Record<string, number>): void {
        writeAnswers(videoId, answers);
        this.answerSubject(videoId).next(answers);
    }

    /** True only the first time it is asked about an answer: the one worth sending for the class stats. */
    claimSend(videoId: number, questionId: string): boolean {
        const key = videoId + ':' + questionId;
        if (this.sent.has(key)) {
            return false;
        }
        this.sent.add(key);

        return true;
    }

    private saveTicks(videoId: number, ticks: ReadonlySet<string>): void {
        this.keepTicks(videoId, ticks);
        markTicksUnsynced(videoId, true);
        clearTimeout(this.waiting.get(videoId));
        this.waiting.set(videoId, setTimeout(() => this.send(videoId), SYNC_DELAY_MS));
    }

    private keepTicks(videoId: number, ticks: ReadonlySet<string>): void {
        writeTicks(videoId, ticks);
        this.tickSubject(videoId).next(ticks);
    }

    /** Sends this device's ticks; if that fails they stay marked, and go with the next change or visit. */
    private send(videoId: number): void {
        this.waiting.delete(videoId);
        const ticks = this.tickSubject(videoId).value;
        this.service.saveTicks(videoId, [...ticks]).subscribe({
            next: () => {
                // A tick made while the request was out is sent by its own timer.
                if (this.tickSubject(videoId).value === ticks) {
                    markTicksUnsynced(videoId, false);
                }
            },
            error: () => undefined,
        });
    }

    /**
     * Once a visit, takes the ticks FlickMan keeps for the reader, unless this device has changes
     * FlickMan has not had yet, or ticks from before FlickMan kept any, which are sent instead.
     */
    private match(videoId: number): void {
        if (this.matched.has(videoId)) {
            return;
        }
        this.matched.add(videoId);
        this.service.watch(videoId).pipe(filter(state => state.status !== 'loading'), take(1)).subscribe(state => {
            if (state.status !== 'ready') {
                this.matched.delete(videoId);

                return;
            }
            const saved = state.aids.my_ticks ?? null;
            if (ticksUnsynced(videoId) || (saved === null && this.tickSubject(videoId).value.size)) {
                this.send(videoId);
            } else if (saved !== null) {
                this.keepTicks(videoId, new Set(saved));
            }
        });
    }

    private tickSubject(videoId: number): BehaviorSubject<ReadonlySet<string>> {
        let subject = this.ticks.get(videoId);
        if (!subject) {
            subject = new BehaviorSubject<ReadonlySet<string>>(readTicks(videoId));
            this.ticks.set(videoId, subject);
        }

        return subject;
    }

    private answerSubject(videoId: number): BehaviorSubject<Record<string, number> | null> {
        let subject = this.answers.get(videoId);
        if (!subject) {
            subject = new BehaviorSubject(readAnswers(videoId));
            this.answers.set(videoId, subject);
        }

        return subject;
    }
}
