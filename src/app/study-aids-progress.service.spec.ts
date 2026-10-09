import {TestBed} from '@angular/core/testing';
import {StudyAidsProgressService} from './study-aids-progress.service';

describe('StudyAidsProgressService', () => {
    let progress: StudyAidsProgressService;

    beforeEach(() => {
        localStorage.removeItem('flickSummaryTicks:7');
        localStorage.removeItem('flickQuizAnswers:7');
        progress = TestBed.inject(StudyAidsProgressService);
    });

    afterEach(() => {
        localStorage.removeItem('flickSummaryTicks:7');
        localStorage.removeItem('flickQuizAnswers:7');
    });

    it('tells everyone watching about a tick, and keeps it', () => {
        const seen: number[] = [];
        progress.ticks$(7).subscribe(ticks => seen.push(ticks.size));
        progress.setTick(7, 'a', true);
        progress.setTick(7, 'b', true);
        progress.setTick(7, 'a', false);

        expect(seen).toEqual([0, 1, 2, 1]);
        expect(JSON.parse(localStorage.getItem('flickSummaryTicks:7') ?? '[]')).toEqual(['b']);
    });

    it('knows a quiz never answered on this device from one cleared for a retake', () => {
        let answers: Record<string, number> | null | undefined;
        progress.answers$(7).subscribe(value => answers = value);
        expect(answers).toBeNull();

        progress.saveAnswers(7, {});
        expect(answers).toEqual({});
    });

    it('lets each answer be sent once', () => {
        expect(progress.claimSend(7, 'a')).toBeTrue();
        expect(progress.claimSend(7, 'a')).toBeFalse();
        expect(progress.claimSend(8, 'a')).toBeTrue();
    });
});
