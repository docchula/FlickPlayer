import {browserPopupRedirectResolver, PopupRedirectResolver} from '@angular/fire/auth';

const SIGNED_IN_KEY = 'flickSignedIn';

/** Remembers whether someone is signed in, for DeferredPopupRedirectResolver on the next visit. */
export function rememberSignedIn(signedIn: boolean): void {
    try {
        if (signedIn) {
            localStorage.setItem(SIGNED_IN_KEY, '1');
        } else {
            localStorage.removeItem(SIGNED_IN_KEY);
        }
    } catch {
        // Storage unavailable: sign-in is set up at startup, as Firebase does by default
    }
}

function wasSignedIn(): boolean {
    try {
        return localStorage.getItem(SIGNED_IN_KEY) === '1';
    } catch {
        return false;
    }
}

type FirebaseResolverClass = new () => PopupRedirectResolver & { get _shouldInitProactively(): boolean };

/**
 * Firebase's handler for popup and redirect sign-in. On phones and in Safari, Firebase sets it up while starting, so
 * that a popup can open straight from the tap: it loads Google's iframe scripts first and only then reports who is
 * signed in, which holds up every page. Someone who was signed in last time most likely still is, so for them it is set
 * up only when a sign-in needs it. A redirect sign-in that is coming back is handled as before.
 */
export class DeferredPopupRedirectResolver extends (browserPopupRedirectResolver as unknown as FirebaseResolverClass) {
    // Overrides an internal getter of Firebase's class. The spec checks that Firebase still has it.
    override get _shouldInitProactively(): boolean {
        return !wasSignedIn() && super._shouldInitProactively;
    }
}
