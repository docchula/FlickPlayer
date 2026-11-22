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

    private idToken: string | null = null;
    // One connection per FlickMan host, as each host sets its own subscriber cookie
    private echos = new Map<string, Echo<'mercure'>>();

    constructor() {
        // Keep the token current: the connector authenticates again to renew the cookie every few minutes
        this.idToken$.subscribe(idToken => {
            this.idToken = idToken;
            this.echos.forEach(echo => echo.connector.options.auth.headers.Authorization = this.authorization());
        });
    }

    /**
     * Play record updates of the signed-in user, from the FlickMan server at the given endpoint (ending with a slash).
     */
    retrieve(endpoint: string): Observable<PlayHistoryValue> {
        const echo = this.echo(endpoint);

        return this.idToken$.pipe(
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

    private echo(endpoint: string): Echo<'mercure'> {
        if (!this.echos.has(endpoint)) {
            // Mercure (server-sent events) client, through FrankenPHP's built-in hub of FlickMan
            this.echos.set(endpoint, new Echo({
                broadcaster: 'mercure',
                host: endpoint + '.well-known/mercure',
                // Sets the hub's subscriber cookie; must share the hub's host, as the cookie is set for it alone
                authEndpoint: endpoint + 'broadcasting/auth',
                auth: {headers: {Authorization: this.authorization()}},
            }));
        }
        return this.echos.get(endpoint);
    }

    private authorization(): string {
        return this.idToken ? "Bearer " + this.idToken : '';
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
