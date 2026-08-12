import {inject, Injectable} from '@angular/core';
import {Auth, getRedirectResult, GoogleAuthProvider, idToken, signInWithPopup, signInWithRedirect, signOut, user, User} from '@angular/fire/auth';
import {BehaviorSubject, Subscription} from 'rxjs';

@Injectable({
    providedIn: 'root'
})
export class AuthService {
    private auth: Auth = inject(Auth);
    idToken$ = idToken(this.auth);
    idTokenSubscription: Subscription;
    user$ = user(this.auth);
    userSubscription: Subscription;

    private readonly idTokenSubject = new BehaviorSubject<string|null>(null);
    public readonly idToken = this.idTokenSubject.asObservable();
    private readonly userSubject = new BehaviorSubject<User|null>(null);
    public readonly user = this.userSubject.asObservable();

    constructor() {
        this.idTokenSubscription = this.idToken$.subscribe((token: string | null) => {
            console.log('idToken refreshed');
            this.idTokenSubject.next(token);
        });
        this.userSubscription = this.user$.subscribe((aUser: User | null) => {
            this.userSubject.next(aUser);
        });
        getRedirectResult(this.auth).catch((error) => console.error('getRedirectResult failed', error));
    }

    signIn() {
        const provider = new GoogleAuthProvider();
        provider.setCustomParameters({hd: 'docchula.com'});
        // Redirect relies on the Firebase Hosting reserved /__/auth/** paths on
        // the authDomain, which localhost dev servers don't serve. Popup works
        // there since it doesn't need those paths, so use it only for localhost.
        if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
            return signInWithPopup(this.auth, provider);
        }
        return signInWithRedirect(this.auth, provider);
    }

    signOut() {
        return signOut(this.auth);
    }

}
