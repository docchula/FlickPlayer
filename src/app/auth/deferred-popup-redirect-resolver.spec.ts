import {browserPopupRedirectResolver} from '@angular/fire/auth';
import {DeferredPopupRedirectResolver, rememberSignedIn} from './deferred-popup-redirect-resolver';

describe('DeferredPopupRedirectResolver', () => {
    const firebasePrototype = (browserPopupRedirectResolver as unknown as { prototype: object }).prototype;

    afterEach(() => rememberSignedIn(false));

    it('overrides a getter that Firebase still has', () => {
        // If a Firebase update renames it, the override does nothing and every start waits for the iframe again
        expect(Object.getOwnPropertyDescriptor(firebasePrototype, '_shouldInitProactively')?.get).toEqual(jasmine.any(Function));
    });

    it('sets up at startup where Firebase would, when nobody was signed in', () => {
        const firebaseAnswer = spyOnProperty(firebasePrototype as { _shouldInitProactively: boolean }, '_shouldInitProactively');
        rememberSignedIn(false);

        firebaseAnswer.and.returnValue(true);
        expect(new DeferredPopupRedirectResolver()._shouldInitProactively).toBe(true);
        firebaseAnswer.and.returnValue(false);
        expect(new DeferredPopupRedirectResolver()._shouldInitProactively).toBe(false);
    });

    it('waits until a sign-in needs it, when someone was signed in last time', () => {
        spyOnProperty(firebasePrototype as { _shouldInitProactively: boolean }, '_shouldInitProactively').and.returnValue(true);
        rememberSignedIn(true);

        expect(new DeferredPopupRedirectResolver()._shouldInitProactively).toBe(false);
    });
});
