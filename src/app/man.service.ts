import {inject, Injectable} from '@angular/core';
import {HttpClient, HttpHeaders} from '@angular/common/http';
import {combineLatestWith, Observable, of, startWith, takeUntil, timer} from 'rxjs';
import {map, shareReplay, switchMap, take, timeout} from 'rxjs/operators';
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
            this.videoList = this.graphql<HomeQueryData>(HOME_QUERY).pipe(
                map(data => data ? toCourseListResponse(data) : null),
                shareReplay(1),
            );
        }
        return this.videoList;
    }

    getVideosInCourse(year: string | null, course: string | null, courseId: string | null) {
        return this.resolveCourseId(year, course, courseId).pipe(
            switchMap(id => id ? this.graphql<CourseQueryData>(COURSE_QUERY, {id}) : of(null)),
            map(result => result?.course ? {
                category: result.course.category,
                name: result.course.name,
                key: result.streamKey,
                lectures: toCourseMembers(result.course.videos),
            } : null),
            map(data => {
                if (!data) {
                    return null;
                }
                let server = this.getEndpointLocation() + 'stream';
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
            }),
        );
    }

    getVideo(videoId: string): Observable<LectureDocInfo | null> {
        const body = {
            query: `query GetVideo($id: ID!) {
                video(id: $id) {
                    id
                    document
                }
            }`,
            variables: {id: videoId},
        };
        if (this.httpOptions.headers.get('Authorization').length < 30) {
            console.error('ManService ID token is not set.');
            return of(null);
        }
        return this.http.post<{ data: { video: LectureDocInfo | null } }>(
            this.getEndpointLocation() + 'graphql',
            body,
            this.httpOptions
        ).pipe(map(response => response?.data?.video ?? null));
    }

    getPlayRecord(year: string, course: string, courseId: string | null, stopPolling: Observable<boolean>): Observable<{
        records: PlayHistory,
        evaluations: { [key: number]: EvaluationRecord },
    }> {
        return timer(1, 60000).pipe(
            switchMap(() => this.resolveCourseId(year, course, courseId).pipe(
                switchMap(id => id ? this.graphql<ProgressQueryData>(PROGRESS_QUERY, {id}) : of(null)),
                map(data => data?.course ? toProgress(data.course.videos) : null),
            )),
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

    updatePlayRecord(uid: string, video_id: string | number, progress: number, speed: number, log: object[]): Observable<JSend<null>> {
        return this.graphql<{ updatePlayRecord: { video_id: string } }>(UPDATE_PLAY_RECORD, {
            uid,
            video_id: String(video_id),
            progress,
            speed,
            log,
        }).pipe(map(data => data ? {status: 'success'} : null));
    }

    sendEvaluation(type: string, video: string | number, result: {
        delivery: number | null,
        material: number | null,
        video: number | null
    }): Observable<JSend<null>> {
        return this.graphql<{ updateVideoEvaluation: { video_id: string } }>(UPDATE_VIDEO_EVALUATION, {
            video_id: String(video),
            type,
            result,
        }).pipe(map(data => data ? {status: 'success'} : null));
    }

    checkAuthorization(): Observable<boolean> {
        return this.get<object>('v1/auth_check').pipe(timeout(8000), map(a => a.hasOwnProperty('success')));
    }

    /** The settings synced across the user's devices (see UserSyncService), or null when they can't be fetched. */
    getUserSettings(): Observable<object | null> {
        return this.get<JSend<object>>('v1/user_settings').pipe(map(response => response?.data ?? null));
    }

    /** Merge a change into the synced settings. `keepalive` lets the request finish while the page closes. */
    saveUserSettings(patch: object): Observable<JSend<null>> {
        return this.post<JSend<null>>('v1/user_settings', patch, {keepalive: true}).pipe(map(response => {
            if (!response) {
                throw new Error('ManService could not send the user settings.');
            }
            return response;
        }));
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

    post<T>(path: string, body: object, options?: object): Observable<T> {
        if (this.httpOptions.headers.get('Authorization').length < 30) {
            console.error('ManService ID token is not set.');
        } else if (!this.getEndpointLocation()) {
            console.error('ManService endpoint is not set.');
        } else {
            return this.http.post<T>(this.getEndpointLocation() + path, body, {...this.httpOptions, ...options});
        }
        return of(null);
    }

    /**
     * Runs a GraphQL operation. Emits null when no ID token is set, and errors when the response has errors and no data.
     */
    private graphql<T>(query: string, variables: object = {}): Observable<T | null> {
        if (this.httpOptions.headers.get('Authorization').length < 30) {
            console.error('ManService ID token is not set.');
            return of(null);
        }
        return this.http.post<{ data?: T | null, errors?: { message: string }[] }>(
            this.getEndpointLocation() + 'graphql',
            {query, variables},
            this.httpOptions,
        ).pipe(map(response => {
            if (!response?.data && response?.errors?.length) {
                throw new Error(response.errors[0].message);
            }
            return response?.data ?? null;
        }));
    }

    /**
     * The course query takes an ID only, so a course given by year and name is looked up in the video list.
     */
    private resolveCourseId(year: string | null, course: string | null, courseId: string | null): Observable<string | null> {
        if (courseId) {
            return of(courseId);
        }
        return this.getVideoList().pipe(
            take(1),
            map(list => {
                const found = list?.years?.[year]?.find(c => c.name === course);
                return found ? String(found.id) : null;
            }),
        );
    }

    searchVideos(query: string): Observable<SearchVideoResult[]> {
        const trimmed = query.trim();
        if (trimmed.length < 2) {
            return of([]);
        }
        const keyword = '%' + trimmed + '%';
        const or: { column: string, operator: string, value: string }[] = [
            {column: 'TITLE', operator: 'LIKE', value: keyword},
            {column: 'LECTURER', operator: 'LIKE', value: keyword},
        ];
        if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
            or.push({column: 'RECORD_DATE', operator: 'EQ', value: trimmed});
        }
        const body = {
            query: `query SearchVideos($where: QueryVideosWhereWhereConditions) {
                videos(where: $where, first: 100) {
                    data { id title lecturer duration course_id }
                }
            }`,
            variables: {where: {OR: or}},
        };
        if (this.httpOptions.headers.get('Authorization').length < 30) {
            console.error('ManService ID token is not set.');
            return of([]);
        }
        return this.http.post<{ data: { videos: { data: SearchVideoResult[] } } }>(
            this.getEndpointLocation() + 'graphql',
            body,
            this.httpOptions
        ).pipe(map(response => response?.data?.videos?.data ?? []));
    }

    // Hybrid keyword + semantic search over the AI-generated video documents. Returns the best section per video.
    searchDocuments(query: string, first = 20): Observable<DocumentSearchHit[]> {
        const trimmed = query.trim();
        if (trimmed.length < 2) {
            return of([]);
        }
        const body = {
            query: `query SearchDocuments($query: String!, $first: Int!) {
                searchDocuments(query: $query, first: $first) {
                    hits { video_id course_id title heading_path snippet score lecturer date }
                }
            }`,
            variables: {query: trimmed.substring(0, 500), first},
        };
        if (this.httpOptions.headers.get('Authorization').length < 30) {
            console.error('ManService ID token is not set.');
            return of([]);
        }
        return this.http.post<{
            data?: { searchDocuments: { hits: DocumentSearchHit[] } | null } | null,
            errors?: { message: string }[],
        }>(
            this.getEndpointLocation() + 'graphql',
            body,
            this.httpOptions
        ).pipe(map(response => {
            const hits = response?.data?.searchDocuments?.hits;
            if (!hits && response?.errors?.length) {
                throw new Error(response.errors[0].message);
            }
            return hits ?? [];
        }));
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

const HOME_QUERY = `query Home {
    categories { name courses { id name is_remote } }
    lastFetchedAt
    me {
        lastPlayed {
            video_id end_time speed played_at
            video { id title lecturer duration course { id category name } }
        }
    }
}`;

const COURSE_QUERY = `query Course($id: ID!) {
    course(id: $id) {
        id category name
        videos {
            id title lecturer record_date duration thumbnail has_document
            sources { server path src type }
            attachments { server path name }
        }
    }
    streamKey
}`;

// Polled while watching a course, so it leaves out everything that does not change.
const PROGRESS_QUERY = `query CourseProgress($id: ID!) {
    course(id: $id) {
        videos {
            id
            myPlayRecord { video_id end_time played_at }
            myEvaluation { id video_id type }
        }
    }
}`;

const UPDATE_PLAY_RECORD = `mutation UpdatePlayRecord($uid: String!, $video_id: ID!, $progress: Float!, $speed: Float!, $log: [PlayLogEntryInput!]) {
    updatePlayRecord(uid: $uid, video_id: $video_id, progress: $progress, speed: $speed, log: $log) { video_id }
}`;

const UPDATE_VIDEO_EVALUATION = `mutation UpdateVideoEvaluation($video_id: ID!, $type: String!, $result: Mixed) {
    updateVideoEvaluation(video_id: $video_id, type: $type, result: $result) { video_id }
}`;

interface HomeQueryData {
    categories: { name: string, courses: { id: string, name: string, is_remote: boolean }[] }[];
    lastFetchedAt: string | null;
    me: {
        lastPlayed: {
            video_id: string,
            end_time: number,
            played_at: string,
            video: {
                id: string,
                title: string,
                lecturer: string | null,
                duration: number | null,
                course: { id: string, category: string | null, name: string },
            },
        } | null,
    } | null;
}

interface CourseQueryData {
    course: {
        id: string,
        category: string,
        name: string,
        videos: {
            id: string,
            title: string,
            lecturer: string | null,
            record_date: string | null,
            duration: number | null,
            has_document: boolean,
            sources: Lecture['sources'],
            attachments: Lecture['attachments'],
        }[],
    } | null;
    streamKey: string;
}

interface ProgressQueryData {
    course: {
        videos: {
            id: string,
            myPlayRecord: { video_id: string, end_time: number, played_at: string } | null,
            myEvaluation: { id: string, video_id: string, type: string } | null,
        }[],
    } | null;
}

function toCourseListResponse(data: HomeQueryData): CourseListResponse {
    const lastPlayed = data.me?.lastPlayed;
    return {
        years: Object.fromEntries(data.categories.map(category => [
            category.name,
            category.courses.map(course => ({id: Number(course.id), name: course.name, is_remote: course.is_remote})),
        ])),
        last_fetched_at: data.lastFetchedAt,
        last_played: lastPlayed ? {
            video: {
                id: Number(lastPlayed.video.id),
                title: lastPlayed.video.title,
                lecturer: lastPlayed.video.lecturer,
                date: null,
                duration: lastPlayed.video.duration ?? undefined,
                sources: [],
                attachments: [],
                course: {
                    id: Number(lastPlayed.video.course.id),
                    name: lastPlayed.video.course.name,
                    category: lastPlayed.video.course.category,
                },
            },
            played_at: lastPlayed.played_at,
            end_time: lastPlayed.end_time,
        } : null,
    };
}

function toCourseMembers(videos: CourseQueryData['course']['videos']): CourseMembers {
    const members: CourseMembers = {};
    for (const video of videos) {
        members[video.id] = {
            id: Number(video.id),
            title: video.title,
            lecturer: video.lecturer,
            date: video.record_date,
            duration: video.duration ?? undefined,
            has_document: video.has_document,
            sources: video.sources,
            attachments: video.attachments,
        };
    }
    return members;
}

function toProgress(videos: ProgressQueryData['course']['videos']): { records: PlayHistory, evaluations: { [key: number]: EvaluationRecord } } {
    const records: PlayHistory = {};
    const evaluations: { [key: number]: EvaluationRecord } = {};
    for (const video of videos) {
        if (video.myPlayRecord) {
            records[video.id] = {
                video_id: Number(video.myPlayRecord.video_id),
                end_time: video.myPlayRecord.end_time,
                played_at: video.myPlayRecord.played_at,
            };
        }
        if (video.myEvaluation) {
            evaluations[Number(video.id)] = {
                id: Number(video.myEvaluation.id),
                type: video.myEvaluation.type,
                video_id: Number(video.myEvaluation.video_id),
            };
        }
    }
    return {records, evaluations};
}

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
    last_fetched_at: string | null; // ISO 8601 with UTC offset
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
    has_document?: boolean;
    course?: {
        id: number;
        name: string;
        category: string;
    };
}

export interface LectureDocInfo {
    id: number; // Server-side ID
    document: string | null;
}

export interface JSend<A> {
    status: string;
    message?: string;
    data?: A;
}

export interface SearchVideoResult {
    id: string;
    title: string;
    lecturer: string;
    duration: number;
    course_id: string;
}

export interface DocumentSearchHit {
    video_id: string;
    course_id: string;
    title: string;
    heading_path: string; // e.g. `Title > Heading > Subheading`
    snippet: string; // raw Markdown excerpt with matches wrapped in `<mark>`
    score: number | null;
    lecturer: string[];
    date: string | null;
}
