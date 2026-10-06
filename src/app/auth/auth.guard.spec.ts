import {TestBed} from '@angular/core/testing';
import {of} from 'rxjs';
import {take, toArray} from 'rxjs/operators';
import {AuthGuard} from './auth.guard';
import {AuthService} from '../auth.service';

describe('AuthGuard', () => {
    function createGuard(user: unknown): AuthGuard {
        TestBed.configureTestingModule({
            providers: [{provide: AuthService, useValue: {user: of(user)}}]
        });
        return TestBed.inject(AuthGuard);
    }

    it('isLoggedIn() emits true when a user is present', done => {
        createGuard({uid: 'abc'}).isLoggedIn().subscribe(result => {
            expect(result).toBe(true);
            done();
        });
    });

    it('isLoggedIn() emits false when the user is undefined (signed out, past the initial null)', done => {
        createGuard(undefined).isLoggedIn().subscribe(result => {
            expect(result).toBe(false);
            done();
        });
    });

    it('isLoggedIn() never emits while the auth state is still null (initial loading state)', () => {
        const emissions: boolean[] = [];
        createGuard(null).isLoggedIn().subscribe(result => emissions.push(result));

        expect(emissions).toEqual([]);
    });

    it('canActivate() delegates to isLoggedIn()', done => {
        createGuard({uid: 'abc'}).canActivate().subscribe(result => {
            expect(result).toBe(true);
            done();
        });
    });

    it('canLoad() delegates to isLoggedIn()', done => {
        const result$ = createGuard({uid: 'abc'}).canLoad();
        (result$ as ReturnType<AuthGuard['isLoggedIn']>).pipe(take(1), toArray()).subscribe(([result]) => {
            expect(result).toBe(true);
            done();
        });
    });
});
