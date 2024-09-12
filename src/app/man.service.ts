import {Injectable} from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import {Observable, of} from 'rxjs';
import {filter, map, tap, timeout} from 'rxjs/operators';
import {environment} from '../environments/environment';
import {PlayHistoryValue} from './play-tracker.service';
import {getStringChanges, RemoteConfig} from '@angular/fire/remote-config';
import {AuthService} from './auth.service';


@Injectable({
    providedIn: 'root'
})
export class ManService {
    private videoList: CourseGroupList;
    private endpoint = ['https://flick-man-cf.docchula.com/', 'https://flick-man.docchula.com/'];
    private originalEndpoint = ['https://flick-man-cf.docchula.com/'];
    private httpOptions = {
        headers: new HttpHeaders({
            Authorization: ''
        })
    };

    constructor(private http: HttpClient, authService: AuthService,
                remoteConfig: RemoteConfig) {
        // Get authentication data
        authService.idToken.subscribe(idToken => this.setIdToken(idToken));
        if (environment.production) {
            // Get endpoint config
            getStringChanges(remoteConfig, 'manEndpoint').pipe(filter(v => !!v)).subscribe(v => {
                const w = v.split(',');
                this.endpoint = w;
                this.originalEndpoint = w;
            });
        }
    }

    setIdToken(idToken: string) {
        this.httpOptions.headers = this.httpOptions.headers.set('Authorization', 'Bearer ' + idToken);
    }

    getVideoList(): Observable<CourseGroupList> {
        return this.videoList ? of(this.videoList) : this.get<JSend<{ years: CourseGroupList }>>('v1/video').pipe(map(response => {
            return response.data.years;
        }), tap(a => {
            this.videoList = a;
        }));
    }

    getVideosInCourse(year: string, course: string) {
        return this.get<JSend<{
            lectures: CourseMembers,
            key: string,
            server?: string
        }>>('v1/video/' + year + '/' + course).pipe(map(response => {
            let server = response.data.server ?? (this.getEndpointLocation() + 'stream');
            if (!server.endsWith('/')) {
                server += '/';
            }
            for (const courseKey of Object.keys(response.data.lectures)) {
                let thisLecture = response.data.lectures[courseKey];
                const identifierFragment = year + '/' + course + '/' + courseKey + '/';
                thisLecture = {
                    ...thisLecture,
                    sources: thisLecture.sources ? thisLecture.sources.map(source => {
                        source.src = source.src
                            ?? ((source.server ?? server) + identifierFragment + source.path);
                        if (source.src.includes('docchula.com')) {
                            source.src += (source.src.includes('?') ? '&key=' : '?key=') + encodeURIComponent(response.data.key);
                        }
                        return source;
                    }) : [],
                    attachments: thisLecture.attachments ? thisLecture.attachments.map(source => {
                        source.src = source.src
                            ?? ((source.server ?? server) + identifierFragment + source.path);
                        source.src += (source.src.includes('?') ? '&key=' : '?key=') + encodeURIComponent(response.data.key);
                        source.name = source.name ?? (source.path.startsWith('DL ') ? source.path.substring(3) : source.path);
                        return source;
                    }) : [],
                    identifier: thisLecture.identifier
                        ?? ((course.includes('[E-Learning]') && thisLecture.id) ? thisLecture.id : (year.substring(0, 3).trim() + '/' + course.substring(0, 7).trim() + '/' + courseKey)),
                    durationInMin: thisLecture.duration ? Math.round(thisLecture.duration / 60) : 0
                };
                for (const source of thisLecture.sources) {
                    if (!source.type.startsWith('application/dash+xml')) {
                        thisLecture.sourceExternal = source.src;
                        break;
                    }
                }
                response.data.lectures[courseKey] = thisLecture;
            }
            return response.data.lectures;
        }));
    }

    checkAuthorization(): Observable<boolean> {
        return this.get<object>('v1/auth_check').pipe(timeout(8000), map(a => a.hasOwnProperty('success')));
    }

    changeEndpoint() {
        this.endpoint.push(this.endpoint.shift());
    }

    get<T>(path: string): Observable<T> {
        if (this.httpOptions.headers.get('Authorization').length < 30) {
            console.error('ManService ID token is not set.');
        } else if (!this.getEndpointLocation()) {
            console.error('ManService endpoint is not set.');
        } else {
            return this.http.get<T>(this.getEndpointLocation() + path, this.httpOptions);
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
    getVideosInCourse: () => of({}),
    getVideoList: () => of({}),
    setIdToken: (idToken: string) => {
    }
};

export interface CourseMembers {
    [key: string]: Lecture;
}

export interface CourseGroupList {
    [key: string]: string[];
}

export interface Lecture {
    title: string;
    lecturer: string;
    date: string | null;
    id?: string; // Server-side ID
    identifier?: string; // Client-side ID, deprecated
    sources: {
        path: string,
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
}

export interface JSend<A> {
    status: string;
    message?: string;
    data?: A;
}
