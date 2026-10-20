import {inject, Injectable} from '@angular/core';
import {catchError, first, map, switchMap, tap} from 'rxjs/operators';
import {defer, EMPTY, fromEventPattern, Observable} from 'rxjs';
import {FieldValue, Timestamp} from '@angular/fire/firestore';
import type Echo from 'laravel-echo';
import {Auth, idToken, user} from '@angular/fire/auth';

@Injectable({
    providedIn: 'root'
})
export class PlayTrackerService {
    private auth: Auth = inject(Auth);
    idToken$ = idToken(this.auth);
    user$ = user(this.auth);

    private readonly updates$: Observable<PlayHistoryValue>;
    private echo?: Promise<Echo<'reverb'>>;

    constructor() {
        // @ts-ignore
        this.updates$ = defer(() => this.connect()).pipe(
            // Without the websocket there are no live updates, but ManService still fetches the play records
            catchError(() => EMPTY),
            switchMap(echo => this.idToken$.pipe(
                tap(idToken => {
                    if (idToken) {
                        echo.connector.options.auth.headers.Authorization = "Bearer " + idToken;
                    }
                }),
                // combine the idToken with the user information (for UID)
                switchMap(idToken => this.user$.pipe(map(user => ({idToken, user})))),
                first(userAndToken => userAndToken.user !== null),
                // Return observable only once
                switchMap(userAndToken =>
                    fromEventPattern(handler => {
                        echo.channel("user." + userAndToken.user.email).listen(".PlayRecordUpdated", handler);
                    }, () => echo.leaveChannel("user." + userAndToken.user.email))),
            )),
            // @ts-ignore
            map((data: Array<object>) => data[0].model),
        );
    }

    retrieve() {
        return this.updates$;
    }

    // The websocket client (Pusher and Echo, about 90 kB) is loaded, and connects, when a page first asks for updates
    private connect(): Promise<Echo<'reverb'>> {
        this.echo ??= Promise.all([import('pusher-js'), import('laravel-echo')]).then(([{default: Pusher}, {default: Echo}]) => {
            // @ts-ignore
            window.Pusher = Pusher;
            return new Echo({
                broadcaster: 'reverb',
                key: 'wr2uu6n8zkbel4nalzzl',
                authEndpoint: 'https://flick-man-app.docchula.com/broadcasting/auth',
                // Real token is set once idToken$ emits, in the tap() above.
                auth: {headers: {Authorization: ''}},
                wsHost: "flick-man-ws.docchula.com",
                wsPort: 443,
                enabledTransports: ['wss', 'ws'],
            });
        }).catch(error => {
            // Let the next page try again
            this.echo = undefined;
            throw error;
        });
        return this.echo;
    }
}

export interface PlayHistory {
    [key: string]: PlayHistoryValue;
}

export interface PlayHistoryValue {
    duration?: number | null;
    end_time: number;
    played_at: Timestamp | FieldValue | string; // ISO 8601 string from the API
    video_id?: number;
    year?: string;
    course?: string;
}
