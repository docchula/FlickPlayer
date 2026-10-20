import {TestBed} from '@angular/core/testing';
import {BehaviorSubject, of} from 'rxjs';
import {AuthService} from '../auth.service';
import {SignedInPreloading} from './signed-in-preloading';

describe('SignedInPreloading', () => {
    let user: BehaviorSubject<unknown>;
    let strategy: SignedInPreloading;
    let load: jasmine.Spy;

    beforeEach(() => {
        user = new BehaviorSubject<unknown>(null);
        TestBed.configureTestingModule({providers: [{provide: AuthService, useValue: {user}}]});
        strategy = TestBed.inject(SignedInPreloading);
        load = jasmine.createSpy('load').and.returnValue(of(null));
    });

    it('preloads other routes straight away', () => {
        strategy.preload({path: 'privacy-policy'}, load).subscribe();

        expect(load).toHaveBeenCalledTimes(1);
    });

    it('preloads the home pages only once someone is signed in, and only once', () => {
        strategy.preload({path: 'home'}, load).subscribe();
        expect(load).not.toHaveBeenCalled();

        user.next({uid: 'abc'});
        user.next({uid: 'abc'});

        expect(load).toHaveBeenCalledTimes(1);
    });
});
