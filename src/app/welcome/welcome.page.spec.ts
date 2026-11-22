import {TestBed} from '@angular/core/testing';
import {Router} from '@angular/router';
import {Subject, throwError, of} from 'rxjs';
import {HttpErrorResponse} from '@angular/common/http';
import {LoadingController, provideIonicAngular} from '@ionic/angular';
import {User} from '@angular/fire/auth';
import {WelcomePage} from './welcome.page';
import {ManService} from '../man.service';
import {AuthService} from '../auth.service';

interface Deferred<T> {
    promise: Promise<T>;
    resolve: (value: T | PromiseLike<T>) => void;
    reject: (reason?: unknown) => void;
}

interface MockLoading {
    present: jasmine.Spy<() => Promise<void>>;
    dismiss: jasmine.Spy<(data?: unknown, role?: string) => Promise<boolean>>;
    onDidDismiss: jasmine.Spy<() => Promise<{role?: string}>>;
    triggerDismiss: (role?: string) => void;
}

function createDeferred<T>(): Deferred<T> {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return {promise, resolve, reject};
}

function createMockLoading(): MockLoading {
    let resolveDismiss!: (detail: {role?: string}) => void;
    let dismissed = false;
    const onDidDismissPromise = new Promise<{role?: string}>((resolve) => {
        resolveDismiss = resolve;
    });

    const triggerDismiss = (role?: string) => {
        if (!dismissed) {
            dismissed = true;
            resolveDismiss({role});
        }
    };

    return {
        present: jasmine.createSpy('present').and.returnValue(Promise.resolve()),
        dismiss: jasmine.createSpy('dismiss').and.callFake((_data?: unknown, role?: string) => {
            triggerDismiss(role);
            return Promise.resolve(true);
        }),
        onDidDismiss: jasmine.createSpy('onDidDismiss').and.returnValue(onDidDismissPromise),
        triggerDismiss,
    };
}

async function flushMicrotasks(turns = 10): Promise<void> {
    for (let i = 0; i < turns; i++) {
        await Promise.resolve();
    }
}

describe('WelcomePage.goToHome', () => {
    let component: WelcomePage;
    let manService: jasmine.SpyObj<Pick<ManService, 'setIdToken' | 'checkAuthorization' | 'changeEndpoint'>>;
    let router: jasmine.SpyObj<Pick<Router, 'navigate'>>;
    let alertSpy: jasmine.Spy;

    beforeEach(() => {
        manService = jasmine.createSpyObj('ManService', ['setIdToken', 'checkAuthorization', 'changeEndpoint']);
        router = jasmine.createSpyObj('Router', ['navigate']);

        TestBed.configureTestingModule({
            providers: [
                provideIonicAngular(),
                WelcomePage,
                {provide: Router, useValue: router},
                {provide: ManService, useValue: manService},
                {provide: AuthService, useValue: {}},
            ],
        });
        component = TestBed.inject(WelcomePage);
        alertSpy = spyOn(component, 'alertError').and.returnValue(Promise.resolve());
        component.user.set({getIdToken: () => Promise.resolve('token')} as never);
    });

    it('ngOnDestroy() does not throw when ngOnInit never set up the auth-state subscription', () => {
        expect(() => component.ngOnDestroy()).not.toThrow();
    });

    it('navigates straight home without fetching a token when already auth-checked', () => {
        component.isAuthChecked = true;

        component.goToHome();

        expect(router.navigate).toHaveBeenCalledWith(['/home']);
        expect(manService.setIdToken).not.toHaveBeenCalled();
    });

    it('does nothing when no user is signed in', async () => {
        component.user.set(null);

        await component.goToHome();

        expect(manService.setIdToken).not.toHaveBeenCalled();
        expect(router.navigate).not.toHaveBeenCalled();
    });

    it('navigates home when authorization succeeds', async () => {
        manService.checkAuthorization.and.returnValue(of(true));

        component.goToHome();
        await flushMicrotasks();

        expect(component.isAuthChecked).toBe(true);
        expect(router.navigate).toHaveBeenCalledWith(['/home']);
    });

    it('shows a client error for an ErrorEvent failure', async () => {
        manService.checkAuthorization.and.returnValue(throwError(() => new ErrorEvent('offline')));

        component.goToHome();
        await flushMicrotasks();

        expect(alertSpy).toHaveBeenCalledWith('Client Error', jasmine.any(String));
    });

    it('shows an unregistered error for a 401', async () => {
        manService.checkAuthorization.and.returnValue(throwError(() => new HttpErrorResponse({status: 401})));

        component.goToHome();
        await flushMicrotasks();

        expect(alertSpy).toHaveBeenCalledWith('Unregistered!', jasmine.any(String));
    });

    it('shows a server error for a 5xx status', async () => {
        manService.checkAuthorization.and.returnValue(throwError(() => new HttpErrorResponse({status: 503})));

        component.goToHome();
        await flushMicrotasks();

        expect(alertSpy).toHaveBeenCalledWith('Server Error', jasmine.any(String));
    });

    it('rotates the endpoint and shows a connection error for anything else', async () => {
        manService.checkAuthorization.and.returnValue(throwError(() => new HttpErrorResponse({status: 418})));

        component.goToHome();
        await flushMicrotasks();

        expect(manService.changeEndpoint).toHaveBeenCalled();
        expect(alertSpy).toHaveBeenCalledWith('Connection Error', jasmine.any(String));
    });
});

describe('WelcomePage.login', () => {
    const SIGN_IN_TIMEOUT_MS = 20_000;

    let component: WelcomePage;
    let authService: {signIn: jasmine.Spy; signOut: jasmine.Spy; user: Subject<User | null>};
    let loadingCtrl: jasmine.SpyObj<Pick<LoadingController, 'create'>>;
    let mockLoading: MockLoading;
    let alertSpy: jasmine.Spy;

    beforeEach(() => {
        jasmine.clock().install();
        mockLoading = createMockLoading();
        loadingCtrl = jasmine.createSpyObj('LoadingController', ['create']);
        loadingCtrl.create.and.returnValue(Promise.resolve(mockLoading as unknown as HTMLIonLoadingElement));

        authService = {
            signIn: jasmine.createSpy('signIn'),
            signOut: jasmine.createSpy('signOut').and.returnValue(Promise.resolve()),
            user: new Subject<User | null>(),
        };

        TestBed.configureTestingModule({
            providers: [
                provideIonicAngular(),
                WelcomePage,
                {provide: Router, useValue: jasmine.createSpyObj('Router', ['navigate'])},
                {
                    provide: ManService,
                    useValue: jasmine.createSpyObj('ManService', ['setIdToken', 'checkAuthorization', 'changeEndpoint']),
                },
                {provide: AuthService, useValue: authService},
                {provide: LoadingController, useValue: loadingCtrl},
            ],
        });

        component = TestBed.inject(WelcomePage);
        alertSpy = spyOn(component, 'alertError').and.returnValue(Promise.resolve());
    });

    afterEach(() => {
        jasmine.clock().uninstall();
    });

    it('triggers signIn synchronously before loadingCtrl.create resolves', async () => {
        const loadingDeferred = createDeferred<HTMLIonLoadingElement>();
        const signInDeferred = createDeferred<void>();
        loadingCtrl.create.and.returnValue(loadingDeferred.promise);
        authService.signIn.and.returnValue(signInDeferred.promise);

        const loginPromise = component.login();

        expect(authService.signIn).toHaveBeenCalledTimes(1);

        loadingDeferred.resolve(mockLoading as unknown as HTMLIonLoadingElement);
        signInDeferred.resolve();
        await loginPromise;
    });

    it('dismisses loading and clears the timeout when signIn succeeds before 20s', async () => {
        const signInDeferred = createDeferred<void>();
        authService.signIn.and.returnValue(signInDeferred.promise);

        const loginPromise = component.login();
        await flushMicrotasks();

        expect(component.isSigningIn()).toBe(true);
        expect(mockLoading.present).toHaveBeenCalledTimes(1);

        signInDeferred.resolve();
        await loginPromise;

        expect(component.isSigningIn()).toBe(false);
        expect(mockLoading.dismiss).toHaveBeenCalled();
        expect(alertSpy).not.toHaveBeenCalled();

        jasmine.clock().tick(SIGN_IN_TIMEOUT_MS);
        await flushMicrotasks();
        expect(alertSpy).not.toHaveBeenCalled();
    });

    it('times out after 20_000 ms, dismisses loading, and shows a timeout alert', async () => {
        authService.signIn.and.returnValue(new Promise(() => {}));

        const loginPromise = component.login();
        await flushMicrotasks();

        jasmine.clock().tick(SIGN_IN_TIMEOUT_MS - 1);
        await flushMicrotasks();
        expect(component.isSigningIn()).toBe(true);
        expect(alertSpy).not.toHaveBeenCalled();

        jasmine.clock().tick(1);
        await loginPromise;

        expect(component.isSigningIn()).toBe(false);
        expect(mockLoading.dismiss).toHaveBeenCalled();
        expect(alertSpy).toHaveBeenCalledWith('Sign-In Timed Out', jasmine.any(String));
    });

    it('ignores duplicate login() calls while a sign-in is already in progress', async () => {
        const signInDeferred = createDeferred<void>();
        authService.signIn.and.returnValue(signInDeferred.promise);

        const firstLogin = component.login();
        const secondLogin = component.login();
        await flushMicrotasks();

        expect(authService.signIn).toHaveBeenCalledTimes(1);
        expect(loadingCtrl.create).toHaveBeenCalledTimes(1);

        signInDeferred.resolve();
        await Promise.all([firstLogin, secondLogin]);
    });

    it('shows a Login Failed alert when signIn rejects with a non-cancellation error', async () => {
        const signInDeferred = createDeferred<void>();
        authService.signIn.and.returnValue(signInDeferred.promise);

        const loginPromise = component.login();
        await flushMicrotasks();

        signInDeferred.reject({code: 'auth/network-request-failed', message: 'Offline'});
        await loginPromise;

        expect(component.isSigningIn()).toBe(false);
        expect(mockLoading.dismiss).toHaveBeenCalled();
        expect(alertSpy).toHaveBeenCalledWith(
            'Login Failed',
            jasmine.stringContaining('auth/network-request-failed')
        );
    });

    it('does not show an alert when the user closes or cancels the pop-up', async () => {
        const signInDeferred = createDeferred<void>();
        authService.signIn.and.returnValue(signInDeferred.promise);

        const loginPromise = component.login();
        await flushMicrotasks();

        signInDeferred.reject({code: 'auth/popup-closed-by-user', message: 'Closed'});
        await loginPromise;

        expect(component.isSigningIn()).toBe(false);
        expect(mockLoading.dismiss).toHaveBeenCalled();
        expect(alertSpy).not.toHaveBeenCalled();
    });

    it('cancels cleanly without alerting when dismissed via backdrop tap', async () => {
        authService.signIn.and.returnValue(new Promise(() => {}));

        const loginPromise = component.login();
        await flushMicrotasks();

        mockLoading.triggerDismiss('backdrop');
        await loginPromise;

        expect(component.isSigningIn()).toBe(false);
        expect(alertSpy).not.toHaveBeenCalled();

        jasmine.clock().tick(SIGN_IN_TIMEOUT_MS);
        await flushMicrotasks();
        expect(alertSpy).not.toHaveBeenCalled();
    });

    it('skips presenting loading if signIn settles before loadingCtrl.create resolves', async () => {
        const loadingDeferred = createDeferred<HTMLIonLoadingElement>();
        loadingCtrl.create.and.returnValue(loadingDeferred.promise);
        authService.signIn.and.returnValue(
            Promise.reject({code: 'auth/internal-error', message: 'Immediate failure'})
        );

        const loginPromise = component.login();
        await flushMicrotasks();

        loadingDeferred.resolve(mockLoading as unknown as HTMLIonLoadingElement);
        await loginPromise;

        expect(mockLoading.present).not.toHaveBeenCalled();
        expect(component.isSigningIn()).toBe(false);
        expect(alertSpy).toHaveBeenCalledWith('Login Failed', jasmine.stringContaining('auth/internal-error'));
    });

    it('dismisses the active login overlay and clears the timeout on ngOnDestroy()', async () => {
        authService.signIn.and.returnValue(new Promise(() => {}));

        const loginPromise = component.login();
        await flushMicrotasks();

        component.ngOnDestroy();
        await loginPromise;

        jasmine.clock().tick(SIGN_IN_TIMEOUT_MS);
        await flushMicrotasks();

        expect(mockLoading.dismiss).toHaveBeenCalledWith(undefined, 'destroy');
        expect(component.isSigningIn()).toBe(false);
        expect(alertSpy).not.toHaveBeenCalled();
    });

    it('dismisses the active login overlay if auth state resolves while signIn is pending', async () => {
        const initLoading = createMockLoading();
        const loginLoading = createMockLoading();
        loadingCtrl.create.and.returnValues(
            Promise.resolve(initLoading as unknown as HTMLIonLoadingElement),
            Promise.resolve(loginLoading as unknown as HTMLIonLoadingElement)
        );
        authService.signIn.and.returnValue(new Promise(() => {}));
        spyOn(component, 'goToHome').and.returnValue(Promise.resolve());

        component.ngOnInit();
        await flushMicrotasks();

        const loginPromise = component.login();
        await flushMicrotasks();

        authService.user.next({getIdToken: () => Promise.resolve('token')} as never);
        await loginPromise;

        jasmine.clock().tick(SIGN_IN_TIMEOUT_MS);
        await flushMicrotasks();

        expect(loginLoading.dismiss).toHaveBeenCalledWith(undefined, 'auth-resolved');
        expect(component.isSigningIn()).toBe(false);
        expect(alertSpy).not.toHaveBeenCalled();
    });

    it('re-enables sign-in and clears pending login state when logout() is called', async () => {
        authService.signIn.and.returnValue(new Promise(() => {}));

        const loginPromise = component.login();
        await flushMicrotasks();
        expect(component.isSigningIn()).toBe(true);

        component.logout();
        await loginPromise;

        jasmine.clock().tick(SIGN_IN_TIMEOUT_MS);
        await flushMicrotasks();

        expect(component.isSigningIn()).toBe(false);
        expect(mockLoading.dismiss).toHaveBeenCalledWith(undefined, 'logout');
        expect(alertSpy).not.toHaveBeenCalled();
    });
});