import {TestBed, fakeAsync, tick} from '@angular/core/testing';
import {Router} from '@angular/router';
import {throwError, of} from 'rxjs';
import {HttpErrorResponse} from '@angular/common/http';
import {provideIonicAngular} from '@ionic/angular/standalone';
import {WelcomePage} from './welcome.page';
import {ManService} from '../man.service';
import {AuthService} from '../auth.service';

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
        component.user = {getIdToken: () => Promise.resolve('token')} as never;
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

    it('navigates home when authorization succeeds', fakeAsync(() => {
        manService.checkAuthorization.and.returnValue(of(true));

        component.goToHome();
        tick();

        expect(component.isAuthChecked).toBe(true);
        expect(router.navigate).toHaveBeenCalledWith(['/home']);
    }));

    it('shows a client error for an ErrorEvent failure', fakeAsync(() => {
        manService.checkAuthorization.and.returnValue(throwError(() => new ErrorEvent('offline')));

        component.goToHome();
        tick();

        expect(alertSpy).toHaveBeenCalledWith('Client Error', jasmine.any(String));
    }));

    it('shows an unregistered error for a 401', fakeAsync(() => {
        manService.checkAuthorization.and.returnValue(throwError(() => new HttpErrorResponse({status: 401})));

        component.goToHome();
        tick();

        expect(alertSpy).toHaveBeenCalledWith('Unregistered!', jasmine.any(String));
    }));

    it('shows a server error for a 5xx status', fakeAsync(() => {
        manService.checkAuthorization.and.returnValue(throwError(() => new HttpErrorResponse({status: 503})));

        component.goToHome();
        tick();

        expect(alertSpy).toHaveBeenCalledWith('Server Error', jasmine.any(String));
    }));

    it('rotates the endpoint and shows a connection error for anything else', fakeAsync(() => {
        manService.checkAuthorization.and.returnValue(throwError(() => new HttpErrorResponse({status: 418})));

        component.goToHome();
        tick();

        expect(manService.changeEndpoint).toHaveBeenCalled();
        expect(alertSpy).toHaveBeenCalledWith('Connection Error', jasmine.any(String));
    }));
});
