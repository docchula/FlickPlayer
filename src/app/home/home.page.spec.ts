import {TestBed, fakeAsync, tick} from '@angular/core/testing';
import {Router} from '@angular/router';
import {Analytics} from '@angular/fire/analytics';
import {of} from 'rxjs';
import {HomePage} from './home.page';
import {ManService} from '../man.service';
import {AuthService} from '../auth.service';
import {ConsentService} from '../consent.service';

describe('HomePage', () => {
    let component: HomePage;
    let manService: jasmine.SpyObj<Pick<ManService, 'getVideoList' | 'searchVideos'>>;
    let router: jasmine.SpyObj<Pick<Router, 'navigate'>>;

    const videoList = {
        years: {
            '1st year': [{id: 10, name: 'Anatomy', is_remote: false}],
        },
        last_fetched_at: '',
        last_played: null,
    };

    beforeEach(() => {
        manService = jasmine.createSpyObj('ManService', ['getVideoList', 'searchVideos']);
        manService.getVideoList.and.returnValue(of(videoList));
        router = jasmine.createSpyObj('Router', ['navigate']);

        TestBed.configureTestingModule({
            providers: [
                HomePage,
                {provide: Router, useValue: router},
                {provide: ManService, useValue: manService},
                {provide: AuthService, useValue: {signOut: () => Promise.resolve()}},
                {provide: Analytics, useValue: {}},
                {provide: ConsentService, useValue: {current: 'unset'}},
            ],
        });
        component = TestBed.inject(HomePage);
        component.ngOnInit();
    });

    it('goToVideo() navigates to the course with the video pre-selected', () => {
        component.goToVideo({id: '5', title: 't', lecturer: 'l', duration: 1, course_id: '10'});

        expect(router.navigate).toHaveBeenCalledWith(['home', 'course', '10'], {queryParams: {video: '5'}});
    });

    it('goToLastVideo() navigates to the video\'s course', () => {
        component.goToLastVideo({
            title: 't', lecturer: 'l', date: null, sources: [], attachments: [],
            course: {id: 42, name: 'Anatomy', category: '1st year'},
        });

        expect(router.navigate).toHaveBeenCalledWith(['home', 'course', 42]);
    });

    it('search results are enriched with course name and year', fakeAsync(() => {
        manService.searchVideos.and.returnValue(of([
            {id: '1', title: 'Video', lecturer: 'A', duration: 100, course_id: '10'},
        ]));

        let results: {courseName?: string; courseYear?: string}[] = [];
        component.searchResults$.subscribe(r => results = r);

        component.onSearchChange({target: {value: 'anatomy'}} as unknown as Event);
        tick(300);

        expect(results.length).toBe(1);
        expect(results[0].courseName).toBe('Anatomy');
        expect(results[0].courseYear).toBe('1st year');
    }));

    it('clears results and isSearching for an empty query', fakeAsync(() => {
        let results: unknown[] = [];
        component.searchResults$.subscribe(r => results = r);
        component.isSearching = true;

        component.onSearchChange({target: {value: ''}} as unknown as Event);
        tick(300);

        expect(results).toEqual([]);
        expect(component.isSearching).toBe(false);
        expect(manService.searchVideos).not.toHaveBeenCalled();
    }));
});
