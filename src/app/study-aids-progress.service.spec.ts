import {fakeAsync, TestBed, tick} from '@angular/core/testing';
import {BehaviorSubject, of, throwError} from 'rxjs';
import {StudyAidsProgressService} from './study-aids-progress.service';
import {StudyAidsService} from './study-aids.service';
import {StudyAids, StudyAidsState} from './study-aids/study-aids.model';

function lecture(myTicks: string[] | null): StudyAidsState {
    return {status: 'ready', aids: {
        video_id: 7, can_edit: false, can_manage: false, generation: 'ready', has_transcript: false, my_ticks: myTicks, summary: null, quiz: null,
    } as StudyAids};
}

describe('StudyAidsProgressService', () => {
    let progress: StudyAidsProgressService;
    let state$: BehaviorSubject<StudyAidsState>;
    let service: jasmine.SpyObj<Pick<StudyAidsService, 'watch' | 'saveTicks'>>;

    const clear = () => ['flickSummaryTicks:7', 'flickQuizAnswers:7', 'flickSummaryTicksUnsynced'].forEach(key => localStorage.removeItem(key));
    const ticksOf = () => {
        let seen: string[] = [];
        progress.ticks$(7).subscribe(ticks => seen = [...ticks]).unsubscribe();

        return seen;
    };

    beforeEach(() => {
        clear();
        state$ = new BehaviorSubject<StudyAidsState>({status: 'loading'});
        service = jasmine.createSpyObj('StudyAidsService', ['watch', 'saveTicks']);
        service.watch.and.returnValue(state$);
        service.saveTicks.and.callFake((videoId, ticks) => of(ticks));
        TestBed.configureTestingModule({providers: [{provide: StudyAidsService, useValue: service}]});
        progress = TestBed.inject(StudyAidsProgressService);
    });

    afterEach(clear);

    it('tells everyone watching about a tick, and keeps it', () => {
        const seen: number[] = [];
        progress.ticks$(7).subscribe(ticks => seen.push(ticks.size));
        progress.setTick(7, 'a', true);
        progress.setTick(7, 'b', true);
        progress.setTick(7, 'a', false);

        expect(seen).toEqual([0, 1, 2, 1]);
        expect(JSON.parse(localStorage.getItem('flickSummaryTicks:7') ?? '[]')).toEqual(['b']);
    });

    it('sends a burst of ticks to FlickMan once', fakeAsync(() => {
        progress.setTick(7, 'a', true);
        tick(500);
        progress.setTick(7, 'b', true);
        tick(1500);

        expect(service.saveTicks).toHaveBeenCalledOnceWith(7, ['a', 'b']);
        expect(localStorage.getItem('flickSummaryTicksUnsynced')).toBe('[]');
    }));

    it('shows the ticks made on another device', () => {
        localStorage.setItem('flickSummaryTicks:7', JSON.stringify(['old']));
        expect(ticksOf()).toEqual(['old']);
        state$.next(lecture(['k3x9', 'a1-b2']));

        expect(ticksOf()).toEqual(['k3x9', 'a1-b2']);
        expect(service.saveTicks).not.toHaveBeenCalled();
    });

    it('sends this device\'s changes when FlickMan has not had them yet', fakeAsync(() => {
        progress.setTick(7, 'mine', true);
        state$.next(lecture(['theirs']));

        expect(ticksOf()).toEqual(['mine']);
        expect(service.saveTicks).toHaveBeenCalledWith(7, ['mine']);
        tick(1500);
    }));

    it('hands FlickMan the ticks kept on this device before it kept any', () => {
        localStorage.setItem('flickSummaryTicks:7', JSON.stringify(['a']));
        ticksOf();
        state$.next(lecture(null));

        expect(service.saveTicks).toHaveBeenCalledOnceWith(7, ['a']);
    });

    it('keeps a change that could not be sent for the next try', fakeAsync(() => {
        service.saveTicks.and.returnValue(throwError(() => ({kind: 'network'})));
        progress.setTick(7, 'a', true);
        tick(1500);

        expect(JSON.parse(localStorage.getItem('flickSummaryTicksUnsynced') ?? '[]')).toEqual([7]);
    }));

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
