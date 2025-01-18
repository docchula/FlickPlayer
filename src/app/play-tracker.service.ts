import {inject, Injectable} from '@angular/core';
import {first, map, mergeMap, switchMap, tap} from 'rxjs/operators';
import {fromEventPattern, Observable} from 'rxjs';
import {FieldValue, Timestamp} from '@angular/fire/firestore';
import Pusher from 'pusher-js';
import Echo from 'laravel-echo';
import {Auth, idToken, user} from '@angular/fire/auth';

@Injectable({
    providedIn: 'root'
})
export class PlayTrackerService {
    private auth: Auth = inject(Auth);
    idToken$ = idToken(this.auth);
    user$ = user(this.auth);

    private readonly updates$: Observable<PlayHistoryValue>;

    constructor() {
        // Setup websocket client
        // @ts-ignore
        window.Pusher = Pusher;
        const echo = new Echo({
            broadcaster: 'reverb',
            key: 'wr2uu6n8zkbel4nalzzl',
            authEndpoint: 'https://flick-man-app.docchula.com/broadcasting/auth',
            auth: {headers: {Authorization: "Bearer " + idToken}},
            wsHost: "flick-man-ws.docchula.com",
            wsPort: 443,
            enabledTransports: ['wss', 'ws'],
        });
        // @ts-ignore
        this.updates$ = this.idToken$.pipe(
            tap(idToken => {
                if (idToken) {
                    echo.connector.options.auth.headers.Authorization = "Bearer " + idToken;
                }
            }),
            // combine the idToken with the user information (for UID)
            switchMap(idToken => this.user$.pipe(map(user => ({idToken, user})))),
            first(),
            // Return observable only once
            switchMap(userAndToken =>
                fromEventPattern(handler => {
                    echo.channel("user." + userAndToken.user.email).listen(".PlayRecordUpdated", handler);
                }, () => echo.leaveChannel("user." + userAndToken.user.email))),
            // @ts-ignore
            map((data: Array<object>) => data[0].model),
        );
    }

    retrieve() {
        return this.updates$;
    }
}

export interface PlayHistory {
    [key: string]: PlayHistoryValue;
}

export interface PlayHistoryValue {
    duration?: number | null;
    end_time: number;
    updated_at: Timestamp | FieldValue;
    video_id?: number;
    year?: string;
    course?: string;
}
