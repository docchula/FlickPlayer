import {TestBed} from '@angular/core/testing';
import {provideRouter} from '@angular/router';
import {BehaviorSubject} from 'rxjs';
import {ScreenTrackingService, UserTrackingService} from '@angular/fire/analytics';
import {AppComponent} from './app.component';
import {ConsentService, ConsentStatus} from './consent.service';

describe('AppComponent (lazy analytics guard)', () => {
    let status$: BehaviorSubject<ConsentStatus>;
    let screenTrackingConstructions: number;
    let userTrackingConstructions: number;

    beforeEach(() => {
        status$ = new BehaviorSubject<ConsentStatus>('unset');
        screenTrackingConstructions = 0;
        userTrackingConstructions = 0;

        TestBed.configureTestingModule({
            imports: [AppComponent],
            providers: [
                provideRouter([]),
                {provide: ConsentService, useValue: {status$}},
                // Providers are lazily instantiated on first Injector.get(), so counting
                // factory invocations verifies the tracking services are resolved at
                // most once, and only after consent is actually granted.
                {provide: ScreenTrackingService, useFactory: () => { screenTrackingConstructions++; return {}; }},
                {provide: UserTrackingService, useFactory: () => { userTrackingConstructions++; return {}; }},
            ],
        });
    });

    it('does not resolve the tracking services while consent is unset', () => {
        TestBed.createComponent(AppComponent);

        expect(screenTrackingConstructions).toBe(0);
        expect(userTrackingConstructions).toBe(0);
    });

    it('does not resolve the tracking services when consent is denied', () => {
        status$.next('unset');
        TestBed.createComponent(AppComponent);
        status$.next('denied');

        expect(screenTrackingConstructions).toBe(0);
        expect(userTrackingConstructions).toBe(0);
    });

    it('resolves the tracking services exactly once when consent is granted', () => {
        TestBed.createComponent(AppComponent);

        status$.next('granted');
        expect(screenTrackingConstructions).toBe(1);
        expect(userTrackingConstructions).toBe(1);

        // A second grant emission must not re-resolve them (the trackingStarted latch).
        status$.next('granted');
        expect(screenTrackingConstructions).toBe(1);
        expect(userTrackingConstructions).toBe(1);
    });
});

describe('AppComponent (rendered in the browser)', () => {
    beforeEach(() => localStorage.removeItem('analyticsConsent'));
    afterEach(() => localStorage.removeItem('analyticsConsent'));

    it('renders the router outlet and the consent banner for a real, unset ConsentService', () => {
        // Uses the real ConsentService (localStorage-backed, defaults to 'unset') and a
        // real Router, so this exercises actual template rendering rather than class logic.
        TestBed.configureTestingModule({
            imports: [AppComponent],
            providers: [provideRouter([])],
        });

        const fixture = TestBed.createComponent(AppComponent);
        fixture.detectChanges();

        const root: HTMLElement = fixture.nativeElement;
        expect(root.querySelector('ion-router-outlet')).toBeTruthy();
        expect(root.querySelector('app-consent-banner')).toBeTruthy();
        // Consent is unset, so the banner's content should actually be in the rendered DOM.
        expect(root.textContent).toContain('Privacy Policy');
    });
});
