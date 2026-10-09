import {fakeAsync, TestBed, tick} from '@angular/core/testing';
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
        const homeData = {categories: [], lastFetchedAt: null, me: null};
        const emptyList = {years: {}, last_fetched_at: null, last_played: null};

        beforeEach(() => service.setIdToken(VALID_TOKEN));

        it('returns the same Observable instance and dedupes the underlying HTTP request across subscribers', () => {
            const first = service.getVideoList();
            const second = service.getVideoList();
            expect(second).toBe(first);

            first.subscribe();
            second.subscribe();

            const req = httpMock.expectOne(APP_ENDPOINT + 'graphql');
            req.flush({data: homeData});

            httpMock.expectNone(APP_ENDPOINT + 'graphql');
        });

        it('replays the cached value to a late subscriber without a new HTTP request', () => {
            service.getVideoList().subscribe();
            httpMock.expectOne(APP_ENDPOINT + 'graphql').flush({data: homeData});

            let late: unknown;
            service.getVideoList().subscribe(v => late = v);

            expect(late).toEqual(emptyList);
            httpMock.expectNone(APP_ENDPOINT + 'graphql');
        });

        it('maps categories, the fetch time and the last played video', done => {
            service.getVideoList().subscribe(list => {
                expect(list).toEqual({
                    years: {
                        '2024': [{id: 7, name: 'Anatomy', is_remote: false}],
                        '2025': [{id: 8, name: 'Physiology', is_remote: true}],
                    },
                    last_fetched_at: '2026-10-08T15:00:04+07:00',
                    last_played: {
                        video: {
                            id: 99, title: 'Intro', lecturer: 'Dr. A', date: null, duration: 600, sources: [], attachments: [],
                            course: {id: 7, name: 'Anatomy', category: '2024'},
                        },
                        played_at: '2026-10-08T16:06:52+07:00',
                        end_time: 50,
                    },
                });
                done();
            });

            httpMock.expectOne(APP_ENDPOINT + 'graphql').flush({
                data: {
                    categories: [
                        {name: '2024', courses: [{id: '7', name: 'Anatomy', is_remote: false}]},
                        {name: '2025', courses: [{id: '8', name: 'Physiology', is_remote: true}]},
                    ],
                    lastFetchedAt: '2026-10-08T15:00:04+07:00',
                    me: {
                        lastPlayed: {
                            video_id: '99', end_time: 50, speed: 1, played_at: '2026-10-08T16:06:52+07:00',
                            video: {id: '99', title: 'Intro', lecturer: 'Dr. A', duration: 600, course: {id: '7', category: '2024', name: 'Anatomy'}},
                        },
                    },
                },
            });
        });

        it('errors when the response has errors and no data', done => {
            service.getVideoList().subscribe({
                error: (e: Error) => {
                    expect(e.message).toBe('Unauthenticated.');
                    done();
                },
            });
            httpMock.expectOne(APP_ENDPOINT + 'graphql').flush({data: null, errors: [{message: 'Unauthenticated.'}]});
        });
    });

    describe('getVideosInCourse', () => {
        beforeEach(() => service.setIdToken(VALID_TOKEN));

        it('requests by courseId when provided', () => {
            service.getVideosInCourse(null, null, '42').subscribe();
            const req = httpMock.expectOne(APP_ENDPOINT + 'graphql');
            expect(req.request.body.variables).toEqual({id: '42'});
            req.flush({data: {course: null, streamKey: 'secret'}});
        });

        it('finds the course id from the video list when only year and name are given', done => {
            service.getVideosInCourse('1st year', 'Anatomy', null).subscribe(result => {
                expect(result.name).toBe('Anatomy');
                done();
            });
            httpMock.expectOne(APP_ENDPOINT + 'graphql').flush({
                data: {
                    categories: [{name: '1st year', courses: [{id: '42', name: 'Anatomy', is_remote: false}]}],
                    lastFetchedAt: null,
                    me: null,
                },
            });
            const req = httpMock.expectOne(APP_ENDPOINT + 'graphql');
            expect(req.request.body.variables).toEqual({id: '42'});
            req.flush({data: {course: {id: '42', category: '1st year', name: 'Anatomy', videos: []}, streamKey: 'secret'}});
        });

        it('maps an unknown course to null', done => {
            service.getVideosInCourse(null, null, '42').subscribe(result => {
                expect(result).toBeNull();
                done();
            });
            httpMock.expectOne(APP_ENDPOINT + 'graphql').flush({data: {course: null, streamKey: 'secret'}});
        });

        it('builds source/attachment src, appends ?key= only for docchula sources, and normalizes attachment names', done => {
            service.getVideosInCourse(null, null, '42').subscribe(result => {
                const lecture = result.lectures['1'];
                expect(result.key).toBe('secret');
                expect(lecture.id).toBe(1);
                expect(lecture.date).toBe('2026-01-02');
                expect(lecture.has_document).toBeTrue();
                // The API fills in the stream host, so src is used as it is.
                expect(lecture.sources[0].src).toBe('https://flick-man-app.docchula.com/videos/video.mp4?key=secret');
                expect(lecture.sources[1].src).toBe('https://external.example.com/other.mp4');
                // A source without src falls back to the current endpoint + 'stream/'.
                expect(lecture.sources[2].src).toBe('https://flick-man-app.docchula.com/stream/video2.mp4?key=secret');
                // src concatenates the raw path (unstripped); only the display `name` strips the "DL " prefix.
                expect(lecture.attachments[0].src).toBe('https://flick-man-app.docchula.com/videos/DL notes.pdf?key=secret');
                expect(lecture.attachments[0].name).toBe('notes.pdf');
                expect(lecture.durationInMin).toBe(2);
                done();
            });

            httpMock.expectOne(APP_ENDPOINT + 'graphql').flush({
                data: {
                    streamKey: 'secret',
                    course: {
                        id: '42', category: '1st year', name: 'Anatomy',
                        videos: [{
                            id: '1', title: 'Intro', lecturer: 'Dr. A', record_date: '2026-01-02', duration: 100, has_document: true,
                            sources: [
                                {
                                    path: 'video.mp4',
                                    server: 'https://flick-man-app.docchula.com/videos/',
                                    src: 'https://flick-man-app.docchula.com/videos/video.mp4',
                                    type: 'video/mp4',
                                },
                                {path: null, server: null, src: 'https://external.example.com/other.mp4', type: 'video/mp4'},
                                {path: 'video2.mp4', server: null, src: null, type: 'video/mp4'},
                            ],
                            attachments: [
                                {path: 'DL notes.pdf', server: 'https://flick-man-app.docchula.com/videos/', name: 'notes.pdf'},
                            ],
                        }],
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

    describe('searchDocuments', () => {
        beforeEach(() => service.setIdToken(VALID_TOKEN));

        it('returns [] without a request for queries under 2 characters', done => {
            service.searchDocuments(' a ').subscribe(result => {
                expect(result).toEqual([]);
                done();
            });
            httpMock.expectNone(() => true);
        });

        it('sends the trimmed query and returns the hits', done => {
            const hit = {video_id: '1', course_id: '2', title: 't', heading_path: 't', snippet: 's', score: 1, lecturer: [], date: null};
            service.searchDocuments('  mitral valve ').subscribe(result => {
                expect(result).toEqual([hit]);
                done();
            });

            const req = httpMock.expectOne(APP_ENDPOINT + 'graphql');
            expect(req.request.body.variables).toEqual({query: 'mitral valve', first: 20});
            req.flush({data: {searchDocuments: {hits: [hit]}}});
        });

        it('errors when the GraphQL response has errors and no data', done => {
            service.searchDocuments('mitral').subscribe({
                error: (e: Error) => {
                    expect(e.message).toBe('Too Many Attempts.');
                    done();
                },
            });
            httpMock.expectOne(APP_ENDPOINT + 'graphql').flush({data: null, errors: [{message: 'Too Many Attempts.'}]});
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

        const progress = (videos: unknown[]) => ({data: {course: {videos}}});

        it('lets a play-tracker update win when the record is missing', fakeAsync(() => {
            playTrackerUpdate = {video_id: 99, end_time: 50, played_at: '2024-01-02'};

            let result: {records: Record<number, unknown>};
            // stopPolling must never emit during the test: takeUntil subscribes to its
            // notifier immediately, so of(false) would complete the whole chain before
            // the timer even fires.
            const sub = service.getPlayRecord(null, null, '42', new Subject()).subscribe(r => result = r);
            tick(1);
            const req = httpMock.expectOne(APP_ENDPOINT + 'graphql');
            expect(req.request.body.variables).toEqual({id: '42'});
            req.flush(progress([]));

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
            httpMock.expectOne(APP_ENDPOINT + 'graphql').flush(progress([
                {id: '99', myPlayRecord: {video_id: '99', end_time: 90, played_at: '2024-01-02'}, myEvaluation: null},
            ]));

            expect(result.records[99]).toEqual({video_id: 99, end_time: 90, played_at: '2024-01-02'});
            sub.unsubscribe();
        }));

        it('maps the evaluations by video id', fakeAsync(() => {
            let result: { evaluations: Record<number, unknown> };
            const sub = service.getPlayRecord(null, null, '42', new Subject()).subscribe(r => result = r);
            tick(1);
            httpMock.expectOne(APP_ENDPOINT + 'graphql').flush(progress([
                {id: '99', myPlayRecord: null, myEvaluation: {id: '5', video_id: '99', type: 'end_play'}},
            ]));

            expect(result.evaluations[99]).toEqual({id: 5, video_id: 99, type: 'end_play'});
            sub.unsubscribe();
        }));
    });

    describe('updatePlayRecord', () => {
        beforeEach(() => service.setIdToken(VALID_TOKEN));

        it('sends the progress as a mutation and reports success', done => {
            const log = [{startTime: 0, endTime: 10, playbackRate: 1, createdAt: 1760000000000, updatedAt: 1760000001000}];
            service.updatePlayRecord('01ULID', 99, 10, 1.5, log).subscribe(result => {
                expect(result).toEqual({status: 'success'});
                done();
            });

            const req = httpMock.expectOne(APP_ENDPOINT + 'graphql');
            expect(req.request.body.variables).toEqual({uid: '01ULID', video_id: '99', progress: 10, speed: 1.5, log});
            req.flush({data: {updatePlayRecord: {video_id: '99'}}});
        });

        it('errors when the mutation is rejected', done => {
            service.updatePlayRecord('bad', 99, 10, 1, []).subscribe({
                error: (e: Error) => {
                    expect(e.message).toBe('Validation failed for the field [updatePlayRecord].');
                    done();
                },
            });
            httpMock.expectOne(APP_ENDPOINT + 'graphql')
                .flush({data: null, errors: [{message: 'Validation failed for the field [updatePlayRecord].'}]});
        });
    });

    describe('sendEvaluation', () => {
        beforeEach(() => service.setIdToken(VALID_TOKEN));

        it('sends the evaluation as a mutation and reports success', done => {
            const result = {delivery: 4, material: null, video: 5};
            service.sendEvaluation('end_play', 99, result).subscribe(response => {
                expect(response).toEqual({status: 'success'});
                done();
            });

            const req = httpMock.expectOne(APP_ENDPOINT + 'graphql');
            expect(req.request.body.variables).toEqual({video_id: '99', type: 'end_play', result});
            req.flush({data: {updateVideoEvaluation: {video_id: '99'}}});
        });
    });
});
