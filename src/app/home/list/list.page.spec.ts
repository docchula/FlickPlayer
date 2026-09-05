import {TestBed, fakeAsync, tick} from '@angular/core/testing';
import {ActivatedRoute, convertToParamMap, Router} from '@angular/router';
import {Analytics} from '@angular/fire/analytics';
import {of, Subject} from 'rxjs';
import {ListPage} from './list.page';
import {ManService} from '../../man.service';
import {ConsentService} from '../../consent.service';

describe('ListPage.groupByAcademicYear (pure)', () => {
    function groupByAcademicYear(courses: {name: string; is_remote: boolean; id: number; link: string[]}[]) {
        return (ListPage.prototype as unknown as {
            groupByAcademicYear: (c: typeof courses) => {year: string; courses: typeof courses}[];
        }).groupByAcademicYear.call(null, courses);
    }

    it('extracts the (25xx) year and buckets non-matching names as Others', () => {
        const courses = [
            {name: 'Anatomy (2567)', is_remote: false, id: 1, link: []},
            {name: 'Physiology (2568)', is_remote: false, id: 2, link: []},
            {name: 'Elective Seminar', is_remote: false, id: 3, link: []},
        ];

        const result = groupByAcademicYear(courses);

        expect(result.map(g => g.year)).toEqual(['2568', '2567', 'Others']);
        expect(result[2].courses.map(c => c.id)).toEqual([3]);
    });

    it('sorts numeric years descending with Others always last', () => {
        const courses = [
            {name: 'A (2565)', is_remote: false, id: 1, link: []},
            {name: 'B', is_remote: false, id: 2, link: []},
            {name: 'C (2570)', is_remote: false, id: 3, link: []},
        ];

        const result = groupByAcademicYear(courses);

        expect(result.map(g => g.year)).toEqual(['2570', '2565', 'Others']);
    });
});

describe('ListPage.formatDuration (pure)', () => {
    function formatDuration(seconds: number): string {
        return ListPage.prototype.formatDuration.call(null, seconds);
    }

    it('returns an empty string for falsy input', () => {
        expect(formatDuration(0)).toBe('');
        expect(formatDuration(null as unknown as number)).toBe('');
    });

    it('formats sub-hour durations in minutes', () => {
        expect(formatDuration(2700)).toBe('45 min');
    });

    it('formats exact-hour durations without minutes', () => {
        expect(formatDuration(7200)).toBe('2h');
    });

    it('formats mixed hour/minute durations', () => {
        expect(formatDuration(5400)).toBe('1h 30m');
    });

    it('handles the 60-minute boundary', () => {
        expect(formatDuration(3600)).toBe('1h');
        expect(formatDuration(3599)).toBe('59 min');
    });
});

describe('ListPage search pipeline', () => {
    let component: ListPage;
    let manService: jasmine.SpyObj<Pick<ManService, 'getVideoList' | 'searchVideos'>>;
    let router: jasmine.SpyObj<Pick<Router, 'navigate'>>;

    const videoList = {
        years: {
            '1st year': [{id: 10, name: 'Anatomy', is_remote: false}],
            '2nd year': [{id: 20, name: 'Physiology', is_remote: false}],
        },
        last_fetched_at: '',
        last_played: null,
    };

    function createComponent(paramMap: Record<string, string>) {
        manService = jasmine.createSpyObj('ManService', ['getVideoList', 'searchVideos']);
        manService.getVideoList.and.returnValue(of(videoList));
        router = jasmine.createSpyObj('Router', ['navigate']);

        TestBed.configureTestingModule({
            providers: [
                ListPage,
                {provide: ActivatedRoute, useValue: {paramMap: of(convertToParamMap(paramMap))}},
                {provide: Router, useValue: router},
                {provide: ManService, useValue: manService},
                {provide: Analytics, useValue: {}},
                {provide: ConsentService, useValue: {current: 'unset'}},
            ],
        });
        component = TestBed.inject(ListPage);
        component.ngOnInit();
    }

    it('navigates home and yields no groups when the year param is missing', done => {
        createComponent({});

        component.groupedList$.subscribe({
            complete: () => {
                expect(router.navigate).toHaveBeenCalledWith(['home']);
                done();
            },
        });
    });

    it('scopes search results to the current year only', fakeAsync(() => {
        createComponent({year: '1st year'});
        // Prime the course lookup, which is built as a side effect of groupedList$.
        component.groupedList$.subscribe();

        manService.searchVideos.and.returnValue(of([
            {id: '1', title: 'In year', lecturer: 'A', duration: 100, course_id: '10'},
            {id: '2', title: 'Other year', lecturer: 'B', duration: 100, course_id: '20'},
        ]));

        let results: {courseYear?: string}[] = [];
        component.searchResults$.subscribe(r => results = r);

        component.onSearchChange({target: {value: 'anatomy'}} as unknown as Event);
        tick(300);

        expect(results.length).toBe(1);
        expect(results[0].courseYear).toBe('1st year');
    }));

    it('clears results and isSearching for an empty query', fakeAsync(() => {
        createComponent({year: '1st year'});
        component.groupedList$.subscribe();

        let results: unknown[] = [];
        component.searchResults$.subscribe(r => results = r);
        component.isSearching = true;

        component.onSearchChange({target: {value: '   '}} as unknown as Event);
        tick(300);

        expect(results).toEqual([]);
        expect(component.isSearching).toBe(false);
        expect(manService.searchVideos).not.toHaveBeenCalled();
    }));
});
