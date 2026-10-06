import {Component, inject, Injector} from '@angular/core';

import {IonApp, IonRouterOutlet} from '@ionic/angular/standalone';
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
}
