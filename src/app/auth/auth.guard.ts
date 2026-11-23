import {inject, Injectable} from '@angular/core';
import {Router, UrlTree} from '@angular/router';
import {AuthService} from '../auth.service';

@Injectable({
    providedIn: 'root'
})
export class AuthGuard {
    private authService = inject(AuthService);
    private router = inject(Router);

    canActivate(): Promise<boolean | UrlTree> {
        return this.isLoggedIn();
    }

    canMatch(): Promise<boolean | UrlTree> {
        return this.isLoggedIn();
    }

    /** Waits for Firebase to settle the auth state, then lets signed-in users through and sends everyone else to sign in. */
    async isLoggedIn(): Promise<boolean | UrlTree> {
        const user = await this.authService.resolvedUser();
        return user ? true : this.router.parseUrl('/');
    }
}
