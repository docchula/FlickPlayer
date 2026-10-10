import {TestBed, fakeAsync, tick} from '@angular/core/testing';
import {Router} from '@angular/router';
import {AlertController, ModalController} from '@ionic/angular/standalone';
import {Analytics} from '@angular/fire/analytics';
import {of, throwError} from 'rxjs';
import {HomePage, SearchResults} from './home.page';
import {ManService} from '../man.service';
import {AuthService} from '../auth.service';
import {ConsentService} from '../consent.service';

describe('HomePage', () => {
    let component: HomePage;
    let manService: jasmine.SpyObj<Pick<ManService, 'getVideoList' | 'searchVideos' | 'searchDocuments'>>;
    let router: jasmine.SpyObj<Pick<Router, 'navigate'>>;

    const videoList = {
        years: {
            '1st year': [{id: 10, name: 'Anatomy', is_remote: false}],
        },
        last_fetched_at: '',
        last_played: null,
    };

    beforeEach(() => {
        manService = jasmine.createSpyObj('ManService', ['getVideoList', 'searchVideos', 'searchDocuments']);
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
                {provide: ModalController, useValue: {}},
                {provide: AlertController, useValue: {}},
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

    it('goToVideo() accepts a content search hit', () => {
        component.goToVideo({video_id: '7', course_id: '10'});

        expect(router.navigate).toHaveBeenCalledWith(['home', 'course', '10'], {queryParams: {video: '7'}});
    });

    it('defaults to searching by title, lecturer or date', () => {
        expect(component.searchMode).toBe('title');
    });

    it('search results are enriched with course name and year', fakeAsync(() => {
        manService.searchVideos.and.returnValue(of([
            {id: '1', title: 'Video', lecturer: 'A', duration: 100, course_id: '10'},
        ]));

        let results: SearchResults | null = null;
        component.searchResults$.subscribe(r => results = r);

        component.onSearchChange({target: {value: 'anatomy'}} as unknown as Event);
        tick(300);

        expect(results.mode).toBe('title');
        expect(results.items.length).toBe(1);
        expect(results.items[0].courseName).toBe('Anatomy');
        expect(results.items[0].courseYear).toBe('1st year');
        expect(manService.searchDocuments).not.toHaveBeenCalled();
    }));

    it('switching to content mode re-runs the query as a document search', fakeAsync(() => {
        manService.searchVideos.and.returnValue(of([]));
        manService.searchDocuments.and.returnValue(of([{
            video_id: '3', course_id: '10', title: 'Heart', heading_path: 'Heart > Valves',
            snippet: 'the <mark>mitral</mark> <b>valve</b>', score: 0.9, lecturer: ['A', 'B'], date: '2024-01-02',
        }]));

        let results: SearchResults | null = null;
        component.searchResults$.subscribe(r => results = r);

        component.onSearchChange({target: {value: 'mitral'}} as unknown as Event);
        tick(300);
        component.onSearchModeChange('content');
        tick(600);

        expect(manService.searchDocuments).toHaveBeenCalledWith('mitral');
        expect(results.mode).toBe('content');
        expect(results.items[0].courseName).toBe('Anatomy');
        expect(results.mode === 'content' && results.items[0].snippetHtml)
            .toBe('the <mark>mitral</mark> &lt;b&gt;valve&lt;/b&gt;');
    }));

    it('reports an error when the content search fails', fakeAsync(() => {
        manService.searchDocuments.and.returnValue(throwError(() => new Error('Too Many Attempts.')));
        component.onSearchModeChange('content');

        let results: SearchResults | null = null;
        component.searchResults$.subscribe(r => results = r);

        component.onSearchChange({target: {value: 'mitral'}} as unknown as Event);
        tick(600);

        expect(results.error).toBeTrue();
        expect(component.isSearching).toBe(false);
    }));

    it('clears results and isSearching for an empty query', fakeAsync(() => {
        let results: SearchResults | null = {mode: 'title', items: []};
        component.searchResults$.subscribe(r => results = r);
        component.isSearching = true;

        component.onSearchChange({target: {value: ''}} as unknown as Event);
        tick(300);

        expect(results).toBeNull();
        expect(component.isSearching).toBe(false);
        expect(manService.searchVideos).not.toHaveBeenCalled();
    }));
});
