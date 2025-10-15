import {inject, Injectable} from '@angular/core';
import {Observable} from 'rxjs';
import {filter, map} from 'rxjs/operators';
import {AuthService} from '../auth.service';

@Injectable({
    providedIn: 'root'
})
export class AuthGuard {
    private authService = inject(AuthService);

    canActivate(): Observable<boolean> {
        // available parameters: route: ActivatedRouteSnapshot, state: RouterStateSnapshot
        return this.isLoggedIn();
    }

    canLoad(): boolean | Observable<boolean> | Promise<boolean> {
        // available parameters: route: Route
        return this.isLoggedIn();
    }

    isLoggedIn(): Observable<boolean> {
        return this.authService.user.pipe(filter(v => v !== null), map(user => !!user));
    }
}
