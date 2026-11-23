import {Component, inject, Injector} from '@angular/core';
import {Event, NavigationCancel, NavigationEnd, NavigationError, Router} from '@angular/router';
import {filter, first} from 'rxjs/operators';

import {IonApp, IonRouterOutlet} from '@ionic/angular';
import {ScreenTrackingService, UserTrackingService} from '@angular/fire/analytics';
import {ConsentService} from './consent.service';
import {ConsentBannerComponent} from './shared/consent-banner.component';

@Component({
    selector: 'app-root',
    templateUrl: 'app.component.html',
    styleUrls: ['app.component.scss'],
    imports: [IonApp, IonRouterOutlet, ConsentBannerComponent],
})
export class AppComponent {
    private injector = inject(Injector);
    private consentService = inject(ConsentService);
    private trackingStarted = false;

    constructor() {
        this.removeSplashWhenReady();

        // Only construct the tracking services (which start sending events) once
        // the user has actually granted consent, rather than eagerly on app boot.
        this.consentService.status$.subscribe(status => {
            if (status === 'granted' && !this.trackingStarted) {
                this.trackingStarted = true;
                this.injector.get(ScreenTrackingService);
                this.injector.get(UserTrackingService);
            }
        });
    }

    /**
     * Fade out the loading screen from index.html once the first navigation has settled (its
     * guards resolved and its page rendered). A fallback keeps it from hiding the app for good
     * if that navigation never settles.
     */
    private removeSplashWhenReady() {
        const splash = document.getElementById('app-splash');
        if (!splash) {
            return;
        }
        let removed = false;
        const remove = () => {
            if (removed) {
                return;
            }
            removed = true;
            clearTimeout(fallback);
            // Wait a frame so the page has painted underneath before the splash goes.
            requestAnimationFrame(() => {
                splash.classList.add('app-splash-hidden');
                setTimeout(() => splash.remove(), 250);
            });
        };
        const fallback = setTimeout(remove, 15000);
        inject(Router).events.pipe(
            filter((e: Event) => e instanceof NavigationEnd || e instanceof NavigationCancel || e instanceof NavigationError),
            first(),
        ).subscribe(remove);
    }
}
