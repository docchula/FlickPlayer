import {inject, Injectable} from '@angular/core';
import {HttpClient, HttpHeaders, HttpParams} from '@angular/common/http';
import {combineLatestWith, Observable, of, startWith, takeUntil, timer} from 'rxjs';
import {map, switchMap, timeout} from 'rxjs/operators';
import {PlayHistory, PlayHistoryValue, PlayTrackerService} from './play-tracker.service';
import {AuthService} from './auth.service';


@Injectable({
    providedIn: 'root'
})
export class ManService {
    private http = inject(HttpClient);
    private playTracker = inject(PlayTrackerService);

    private videoList: Observable<CourseListResponse>;
    private endpoint = ['https://flick-man-app.docchula.com/', 'https://flick-man-cdn.docchula.com/'];
    private originalEndpoint = ['https://flick-man-cdn.docchula.com/'];
    private httpOptions = {
        headers: new HttpHeaders({
            Authorization: ''
        })
    };

    constructor() {
        const authService = inject(AuthService);

        // remoteConfig: RemoteConfig
        /* if (environment.production) {
            // Get endpoint config
            getStringChanges(remoteConfig, 'manEndpoint').pipe(filter(v => !!v)).subscribe(v => {
                const w = v.split(',');
                this.endpoint = w;
                this.originalEndpoint = w;
            });
        } */
        // Get authentication data
        authService.idToken.subscribe(idToken => this.setIdToken(idToken));
    }

    setIdToken(idToken: string) {
        this.httpOptions.headers = this.httpOptions.headers.set('Authorization', 'Bearer ' + idToken);
    }

    getVideoList(): Observable<CourseListResponse> {
        if (!this.videoList) {
            this.videoList = this.get<JSend<CourseListResponse>>('v1/video').pipe(map(response => response?.data));
        }
        return this.videoList;
    }

    getVideosInCourse(year: string | null, course: string | null, courseId: string | null) {
        return this.get<JSend<{
            lectures: CourseMembers,
            key: string,
            server?: string,
            category: string,
            name: string,
        }>>('v1/video/' + (courseId ?? (year + '/' + course)))
            .pipe(map(response => {
                if (!response || !response.data) {
                    return null;
                }
                const data = response.data;
                let server = data.server ?? (this.getEndpointLocation() + 'stream');
                if (!server.endsWith('/')) {
                    server += '/';
                }
                for (const courseKey of Object.keys(data.lectures)) {
                    let thisLecture = data.lectures[courseKey];
                    thisLecture = {
                        ...thisLecture,
                        sources: thisLecture.sources ? thisLecture.sources.map(source => {
                            source.src = source.src
                                ?? ((source.server ?? server) + source.path);
                            if (source.src.includes('docchula.com')) {
                                source.src += (source.src.includes('?') ? '&key=' : '?key=') + encodeURIComponent(data.key);
                            }
                            return source;
                        }) : [],
                        attachments: thisLecture.attachments ? thisLecture.attachments.map(source => {
                            source.src = source.src
                                ?? ((source.server ?? server) + source.path);
                            source.src += (source.src.includes('?') ? '&key=' : '?key=') + encodeURIComponent(data.key);
                            source.name = source.name ?? (source.path.startsWith('DL ') ? source.path.substring(3) : source.path);
                            return source;
                        }) : [],
                        identifier: thisLecture.identifier ?? String(thisLecture.id),
                        durationInMin: thisLecture.duration ? Math.round(thisLecture.duration / 60) : 0,
                    };
                    for (const source of thisLecture.sources) {
                        if (!source.type.startsWith('application/dash+xml')) {
                            thisLecture.sourceExternal = source.src;
                            break;
                        }
                    }
                    data.lectures[courseKey] = thisLecture;
                }
                return data;
            }));
    }

    getPlayRecord(year: string, course: string, courseId: string | null, stopPolling: Observable<boolean>): Observable<{
        records: PlayHistory,
        evaluations: { [key: number]: EvaluationRecord },
    }> {
        const params = courseId ? new HttpParams().set("course_id", courseId ?? '') : new HttpParams().set("year", year).set("course", course);
        return timer(1, 60000).pipe(
            switchMap(() => this.get<JSend<{
                records: PlayHistory,
                evaluations: { [key: number]: EvaluationRecord },
            }>>('v1/play_records', {params}).pipe(map(response => response?.data))),
            // Replace value with update from play tracker if available
            combineLatestWith(this.playTracker.retrieve().pipe(startWith(null))),
            map(([data, update]) => {
                const records = data?.records ?? {};
                if (update) {
                    if (!records[update.video_id] ||
                        (records[update.video_id].played_at < update.played_at)) {
                        records[update.video_id] = update;
                    }
                }
                return {
                    records,
                    evaluations: data?.evaluations ?? {},
                };
            }),
            takeUntil(stopPolling),
        );
    }

    updatePlayRecord(uid: string, video_id: string | number, progress: number, speed: number, log: object[]) {
        return this.post<JSend<null>>('v1/play_records', {
            uid,
            video_id,
            progress,
            speed,
            log,
        });
    }

    sendEvaluation(type: string, video: string | number, result: { delivery: number | null, material: number | null, video: number | null }) {
        return this.post<JSend<null>>('v1/evaluations', {type, video, result});
    }

    checkAuthorization(): Observable<boolean> {
        return this.get<object>('v1/auth_check').pipe(timeout(8000), map(a => a.hasOwnProperty('success')));
    }

    changeEndpoint() {
        this.endpoint.push(this.endpoint.shift());
    }

    get<T>(path: string, options?: object): Observable<T> {
        if (this.httpOptions.headers.get('Authorization').length < 30) {
            console.error('ManService ID token is not set.');
        } else if (!this.getEndpointLocation()) {
            console.error('ManService endpoint is not set.');
        } else {
            return this.http.get<T>(this.getEndpointLocation() + path, {...this.httpOptions, ...options});
        }
        return of(null);
    }

    post<T>(path: string, body: object): Observable<T> {
        if (this.httpOptions.headers.get('Authorization').length < 30) {
            console.error('ManService ID token is not set.');
        } else if (!this.getEndpointLocation()) {
            console.error('ManService endpoint is not set.');
        } else {
            return this.http.post<T>(this.getEndpointLocation() + path, body, this.httpOptions);
        }
        return of(null);
    }

    /*updateCurrentStudent(requestBody) {
        if (!this.email) {
            console.error('ManService user email is not set.');
        }
        return this.patch('students/' + this.email, requestBody);
    }*/

    private getEndpointLocation(): string {
        if (this.endpoint.length > 0) {
            return this.endpoint[0];
        } else {
            return this.originalEndpoint[0];
        }
    }

    /*patch(path: string, body): Observable<Object> {
        if (this.httpOptions.headers.get('Authorization').length < 5) {
            console.error('ManService ID token is not set.');
        }
        return this.http.patch(ManEndpoint + path, body, this.httpOptions);
    }*/
}

export const ManServiceStub: Partial<ManService> = {
    getVideosInCourse: () => of({lectures: {}, key: '', category: '', name: ''}),
    getVideoList: () => of({years: {}, last_fetched_at: '', last_played: null}),
    setIdToken: () => {},
};

export interface CourseMembers {
    [key: string]: Lecture;
}

export interface CourseListResponse {
    years: {
        [key: string]: {
            id: number;
            name: string;
            is_remote: boolean;
        }[];
    };
    last_fetched_at: string;
    last_played: { video: Lecture, played_at: string, end_time: number } | null;
}

export interface EvaluationRecord {
    id: number;
    type: string;
    video_id: number;
}

export interface Lecture {
    title: string;
    lecturer: string;
    date: string | null;
    id?: number; // Server-side ID
    identifier?: string; // Client-side ID, deprecated
    sources: {
        path?: string,
        type: string,
        server: string | null,
        src: string
    }[];
    attachments: {
        server: string | null,
        path: string,
        src?: string,
        name?: string
    }[];
    sourceExternal?: string;
    duration?: number;
    durationInMin?: number;
    history?: PlayHistoryValue;
    is_evaluated?: boolean;
    course?: {
        id: number;
        name: string;
        category: string;
    };
}

export interface JSend<A> {
    status: string;
    message?: string;
    data?: A;
}
