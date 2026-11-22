import {inject, Injectable} from '@angular/core';
import {first, map, switchMap} from 'rxjs/operators';
import {fromEventPattern, Observable} from 'rxjs';
import {FieldValue, Timestamp} from '@angular/fire/firestore';
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
        // Setup Mercure (server-sent events) client, through FrankenPHP's built-in hub of FlickMan
        const echo = new Echo({
            broadcaster: 'mercure',
            host: 'https://flick-man-app.docchula.com/.well-known/mercure',
            // Sets the hub's subscriber cookie; must share the hub's host, as the cookie is set for it alone
            authEndpoint: 'https://flick-man-app.docchula.com/broadcasting/auth',
            // Real token is set by the subscription below.
            auth: {headers: {Authorization: ''}},
        });
        // Keep the token current: the connector authenticates again to renew the cookie every few minutes
        this.idToken$.subscribe(idToken => {
            echo.connector.options.auth.headers.Authorization = idToken ? "Bearer " + idToken : '';
        });
        // @ts-ignore
        this.updates$ = this.idToken$.pipe(
            // combine the idToken with the user information (for UID)
            switchMap(idToken => this.user$.pipe(map(user => ({idToken, user})))),
            first(userAndToken => userAndToken.idToken !== null && userAndToken.user !== null),
            // Return observable only once
            switchMap(userAndToken =>
                fromEventPattern(handler => {
                    echo.private("user." + userAndToken.user.uid).listen(".PlayRecordUpdated", handler);
                }, () => echo.leave("user." + userAndToken.user.uid))),
            // The Mercure connector calls listeners with the event payload alone (pusher-js also passed metadata)
            map((payload: {model: PlayHistoryValue}) => payload.model),
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
    played_at: Timestamp | FieldValue | string; // ISO 8601 string from the API
    video_id?: number;
    year?: string;
    course?: string;
}
