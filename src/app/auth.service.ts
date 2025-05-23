import {inject, Injectable} from '@angular/core';
import {Auth, GoogleAuthProvider, idToken, user, signInWithPopup, signOut, User} from '@angular/fire/auth';
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
    }

    signInWithPopup() {
        const provider = new GoogleAuthProvider();
        provider.setCustomParameters({hd: 'docchula.com'});
        return signInWithPopup(this.auth, provider);
    }

    signOut() {
        return signOut(this.auth);
    }

}
