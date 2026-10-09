import {Injectable} from '@angular/core';
import {BehaviorSubject, Observable} from 'rxjs';
import {readAnswers, readTicks, writeAnswers, writeTicks} from './study-aids/local-store';

/**
 * What a reader has done with a lecture's summary and quiz on this device. The card under the
 * video and the reading window share it, so ticking or answering in one shows in the other.
 */
@Injectable({
    providedIn: 'root',
})
export class StudyAidsProgressService {
    private readonly ticks = new Map<number, BehaviorSubject<ReadonlySet<string>>>();
    private readonly answers = new Map<number, BehaviorSubject<Record<string, number> | null>>();
    private readonly sent = new Set<string>();

    ticks$(videoId: number): Observable<ReadonlySet<string>> {
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
        writeTicks(videoId, ticks);
        this.tickSubject(videoId).next(ticks);
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
