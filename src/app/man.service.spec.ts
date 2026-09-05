import {TestBed, fakeAsync, tick} from '@angular/core/testing';
import {provideHttpClient} from '@angular/common/http';
import {HttpTestingController, provideHttpClientTesting} from '@angular/common/http/testing';
import {of, Subject} from 'rxjs';
import {ManService} from './man.service';
import {AuthService} from './auth.service';
import {PlayTrackerService} from './play-tracker.service';

describe('ManService', () => {
    let service: ManService;
    let httpMock: HttpTestingController;
    let playTrackerUpdate: unknown = null;

    const APP_ENDPOINT = 'https://flick-man-app.docchula.com/';
    const VALID_TOKEN = 'x'.repeat(40);

    beforeEach(() => {
        playTrackerUpdate = null;
        TestBed.configureTestingModule({
            providers: [
                provideHttpClient(),
                provideHttpClientTesting(),
                // AuthService can't be constructed without real Firebase (see plan);
                // PlayTrackerService opens a real websocket in its constructor.
                // Both are stubbed so ManService's own logic can be tested in isolation.
                {provide: AuthService, useValue: {idToken: of(null)}},
                // Reads playTrackerUpdate at call time so individual tests can vary
                // it without needing to reconfigure the TestBed module.
                {provide: PlayTrackerService, useValue: {retrieve: () => of(playTrackerUpdate)}},
            ],
        });
        service = TestBed.inject(ManService);
        httpMock = TestBed.inject(HttpTestingController);
    });

    afterEach(() => {
        httpMock.verify();
    });

    describe('the Authorization gate', () => {
        it('issues no request and returns null when no ID token has been set', done => {
            service.get('v1/video').subscribe(result => {
                expect(result).toBeNull();
                done();
            });
            httpMock.expectNone(() => true);
        });

        it('issues the request once a sufficiently long token is set', () => {
            service.setIdToken(VALID_TOKEN);
            service.get('v1/video').subscribe();

            const req = httpMock.expectOne(APP_ENDPOINT + 'v1/video');
            expect(req.request.headers.get('Authorization')).toBe('Bearer ' + VALID_TOKEN);
            req.flush({});
        });
    });

    describe('getVideoList', () => {
        beforeEach(() => service.setIdToken(VALID_TOKEN));

        it('returns the same Observable instance on repeat calls, but does not dedupe the underlying HTTP request', () => {
            // NOTE: this is a real caching bug (documented, not fixed here — see plan).
            // getVideoList() reuses the same pipeline object, but never multicasts it
            // (no shareReplay), so each subscription still issues its own HTTP request.
            const first = service.getVideoList();
            const second = service.getVideoList();
            expect(second).toBe(first);

            first.subscribe();
            second.subscribe();

            const reqs = httpMock.match(APP_ENDPOINT + 'v1/video');
            expect(reqs.length).toBe(2);
            reqs.forEach(r => r.flush({status: 'success', data: {years: {}, last_fetched_at: '', last_played: null}}));
        });
    });

    describe('getVideosInCourse', () => {
        beforeEach(() => service.setIdToken(VALID_TOKEN));

        it('requests by courseId when provided', () => {
            service.getVideosInCourse(null, null, '42').subscribe();
            httpMock.expectOne(APP_ENDPOINT + 'v1/video/42').flush({status: 'success', data: null});
        });

        it('requests by year/course when courseId is absent', () => {
            service.getVideosInCourse('1st year', 'Anatomy', null).subscribe();
            httpMock.expectOne(APP_ENDPOINT + 'v1/video/1st year/Anatomy').flush({status: 'success', data: null});
        });

        it('maps a null response to null', done => {
            service.getVideosInCourse(null, null, '42').subscribe(result => {
                expect(result).toBeNull();
                done();
            });
            httpMock.expectOne(APP_ENDPOINT + 'v1/video/42').flush({status: 'success'});
        });

        it('builds source/attachment src, appends ?key= only for docchula sources, and normalizes attachment names', done => {
            service.getVideosInCourse(null, null, '42').subscribe(result => {
                const lecture = result.lectures['1'];
                // Default server falls back to the current endpoint (the app endpoint here) + 'stream/'.
                expect(lecture.sources[0].src).toBe('https://flick-man-app.docchula.com/stream/video.mp4?key=secret');
                expect(lecture.sources[1].src).toBe('https://external.example.com/other.mp4');
                // src concatenates the raw path (unstripped); only the display `name` strips the "DL " prefix.
                expect(lecture.attachments[0].src).toBe('https://flick-man-app.docchula.com/stream/DL notes.pdf?key=secret');
                expect(lecture.attachments[0].name).toBe('notes.pdf');
                expect(lecture.durationInMin).toBe(2);
                done();
            });

            httpMock.expectOne(APP_ENDPOINT + 'v1/video/42').flush({
                status: 'success',
                data: {
                    key: 'secret',
                    category: '1st year',
                    name: 'Anatomy',
                    lectures: {
                        '1': {
                            title: 'Intro', lecturer: 'Dr. A', date: null, duration: 100,
                            sources: [
                                {path: 'video.mp4', server: null, type: 'video/mp4'},
                                {src: 'https://external.example.com/other.mp4', server: null, type: 'video/mp4'},
                            ],
                            attachments: [
                                {path: 'DL notes.pdf', server: null},
                            ],
                        },
                    },
                },
            });
        });
    });

    describe('searchVideos', () => {
        beforeEach(() => service.setIdToken(VALID_TOKEN));

        it('returns [] without a request for queries under 2 characters', done => {
            service.searchVideos('a').subscribe(result => {
                expect(result).toEqual([]);
                done();
            });
            httpMock.expectNone(() => true);
        });

        it('wraps the keyword and adds a RECORD_DATE clause for a date-shaped query', () => {
            service.searchVideos('2024-01-02').subscribe();

            const req = httpMock.expectOne(APP_ENDPOINT + 'graphql');
            const or = req.request.body.variables.where.OR;
            expect(or).toEqual(jasmine.arrayContaining([
                {column: 'TITLE', operator: 'LIKE', value: '%2024-01-02%'},
                {column: 'LECTURER', operator: 'LIKE', value: '%2024-01-02%'},
                {column: 'RECORD_DATE', operator: 'EQ', value: '2024-01-02'},
            ]));
            req.flush({data: {videos: {data: []}}});
        });

        it('does not add a RECORD_DATE clause for a non-date query', () => {
            service.searchVideos('anatomy').subscribe();

            const req = httpMock.expectOne(APP_ENDPOINT + 'graphql');
            expect(req.request.body.variables.where.OR.length).toBe(2);
            req.flush({data: {videos: {data: []}}});
        });
    });

    describe('checkAuthorization', () => {
        beforeEach(() => service.setIdToken(VALID_TOKEN));

        it('maps a response with a success field to true', done => {
            service.checkAuthorization().subscribe(result => {
                expect(result).toBe(true);
                done();
            });
            httpMock.expectOne(APP_ENDPOINT + 'v1/auth_check').flush({success: true});
        });

        it('maps a response without a success field to false', done => {
            service.checkAuthorization().subscribe(result => {
                expect(result).toBe(false);
                done();
            });
            httpMock.expectOne(APP_ENDPOINT + 'v1/auth_check').flush({});
        });
    });

    describe('changeEndpoint', () => {
        it('rotates to the next endpoint', () => {
            service.setIdToken(VALID_TOKEN);
            service.changeEndpoint();
            service.get('v1/video').subscribe();

            httpMock.expectOne('https://flick-man-cdn.docchula.com/v1/video').flush({});
        });
    });

    describe('getPlayRecord merge rule', () => {
        beforeEach(() => service.setIdToken(VALID_TOKEN));

        it('lets a play-tracker update win when the record is missing', fakeAsync(() => {
            playTrackerUpdate = {video_id: 99, end_time: 50, played_at: '2024-01-02'};

            let result: {records: Record<number, unknown>};
            // stopPolling must never emit during the test: takeUntil subscribes to its
            // notifier immediately, so of(false) would complete the whole chain before
            // the timer even fires.
            const sub = service.getPlayRecord(null, null, '42', new Subject()).subscribe(r => result = r);
            tick(1);
            httpMock.expectOne(APP_ENDPOINT + 'v1/play_records?course_id=42')
                .flush({status: 'success', data: {records: {}, evaluations: {}}});

            expect(result.records[99]).toEqual({video_id: 99, end_time: 50, played_at: '2024-01-02'});
            // Unsubscribe explicitly: nothing else stops the 60s poll, and its pending
            // reschedule would otherwise fire mid-teardown and leave a dangling request.
            sub.unsubscribe();
        }));

        it('keeps the existing record when it is newer than the update', fakeAsync(() => {
            playTrackerUpdate = {video_id: 99, end_time: 10, played_at: '2024-01-01'};

            let result: {records: Record<number, unknown>};
            const sub = service.getPlayRecord(null, null, '42', new Subject()).subscribe(r => result = r);
            tick(1);
            httpMock.expectOne(APP_ENDPOINT + 'v1/play_records?course_id=42').flush({
                status: 'success',
                data: {records: {99: {video_id: 99, end_time: 90, played_at: '2024-01-02'}}, evaluations: {}},
            });

            expect(result.records[99]).toEqual({video_id: 99, end_time: 90, played_at: '2024-01-02'});
            sub.unsubscribe();
        }));
    });
});
