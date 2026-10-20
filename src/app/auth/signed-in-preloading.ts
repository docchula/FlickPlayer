import {inject, Injectable} from '@angular/core';
import {PreloadingStrategy, Route} from '@angular/router';
import {Observable} from 'rxjs';
import {first, switchMap} from 'rxjs/operators';
import {AuthService} from '../auth.service';

/**
 * Preloads every lazy route, but the home pages only once someone is signed in: nobody else can open them, and
 * downloading them would slow the welcome page down for those who still have to sign in.
 */
@Injectable({
    providedIn: 'root'
})
export class SignedInPreloading implements PreloadingStrategy {
    private authService = inject(AuthService);

    preload(route: Route, load: () => Observable<unknown>): Observable<unknown> {
        if (route.path !== 'home') {
            return load();
        }
        return this.authService.user.pipe(first(user => !!user), switchMap(() => load()));
    }
}
