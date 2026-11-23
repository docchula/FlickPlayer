import {TestBed} from '@angular/core/testing';
import {provideRouter, Router, UrlTree} from '@angular/router';
import {AuthGuard} from './auth.guard';
import {AuthService} from '../auth.service';

describe('AuthGuard', () => {
    function createGuard(resolvedUser: () => Promise<unknown>): AuthGuard {
        TestBed.configureTestingModule({
            providers: [
                provideRouter([]),
                {provide: AuthService, useValue: {resolvedUser}},
            ]
        });
        return TestBed.inject(AuthGuard);
    }

    it('allows a signed-in user', async () => {
        const guard = createGuard(() => Promise.resolve({uid: 'abc'}));

        expect(await guard.isLoggedIn()).toBe(true);
    });

    it('redirects a signed-out user to the sign-in page', async () => {
        const guard = createGuard(() => Promise.resolve(null));

        const result = await guard.isLoggedIn();

        expect(result instanceof UrlTree).toBe(true);
        expect(TestBed.inject(Router).serializeUrl(result as UrlTree)).toBe('/');
    });

    it('waits for the auth state to settle before deciding', async () => {
        let settle!: (user: unknown) => void;
        const guard = createGuard(() => new Promise(resolve => settle = resolve));
        let decided = false;

        const result = guard.isLoggedIn().then(r => {
            decided = true;
            return r;
        });
        await Promise.resolve();
        expect(decided).toBe(false);

        settle({uid: 'abc'});
        expect(await result).toBe(true);
    });

    it('canActivate() and canMatch() delegate to isLoggedIn()', async () => {
        const guard = createGuard(() => Promise.resolve({uid: 'abc'}));

        expect(await guard.canActivate()).toBe(true);
        expect(await guard.canMatch()).toBe(true);
    });
});
