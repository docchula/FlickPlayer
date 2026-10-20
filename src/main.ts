import {enableProdMode, importProvidersFrom, inject, provideAppInitializer, provideZoneChangeDetection} from '@angular/core';

import {environment} from './environments/environment';
import {RouteReuseStrategy} from '@angular/router';
import {IonicRouteStrategy, provideIonicAngular} from '@ionic/angular';
import {DEBUG_MODE} from '@angular/fire/compat/analytics';
import {getApp, initializeApp, provideFirebaseApp} from '@angular/fire/app';
import {browserLocalPersistence, browserSessionPersistence, indexedDBLocalPersistence, initializeAuth, provideAuth} from '@angular/fire/auth';
import {getAnalytics, provideAnalytics, ScreenTrackingService, UserTrackingService} from '@angular/fire/analytics';
import {getPerformance, providePerformance} from '@angular/fire/performance';
import {provideHttpClient, withFetch, withInterceptorsFromDi} from '@angular/common/http';
import {provideAnimationsAsync} from '@angular/platform-browser/animations/async';
import {providePrimeNG} from 'primeng/config';
import {bootstrapApplication, BrowserModule} from '@angular/platform-browser';
import {AppRoutingModule} from './app/app-routing.module';
import {WelcomePageModule} from './app/welcome/welcome.module';
import {ServiceWorkerModule} from '@angular/service-worker';
import {AppComponent} from './app/app.component';
import Aura from '@primeuix/themes/aura';
import {ThemeService} from './app/theme.service';
import {DeferredPopupRedirectResolver} from './app/auth/deferred-popup-redirect-resolver';

if (environment.production) {
  enableProdMode();
}

bootstrapApplication(AppComponent, {
    providers: [
        provideZoneChangeDetection(),
        importProvidersFrom(BrowserModule, AppRoutingModule, WelcomePageModule, ServiceWorkerModule.register('ngsw-worker.js', {enabled: environment.production})),
        {provide: RouteReuseStrategy, useClass: IonicRouteStrategy},
        // Start theming before the first page renders, so the saved theme is live from the outset.
        provideAppInitializer(() => {
            inject(ThemeService);
        }),
        {provide: DEBUG_MODE, useValue: !environment.production},
        provideIonicAngular(),
        provideFirebaseApp(() => initializeApp(environment.firebase)),
        // What getAuth() sets up, but with a popup and redirect handler that does not hold up the start (see the class)
        provideAuth(() => initializeAuth(getApp(), {
            persistence: [indexedDBLocalPersistence, browserLocalPersistence, browserSessionPersistence],
            popupRedirectResolver: DeferredPopupRedirectResolver,
        })),
        provideAnalytics(() => getAnalytics()),
        providePerformance(() => getPerformance()),
        provideHttpClient(withFetch(), withInterceptorsFromDi()),
        ScreenTrackingService,
        UserTrackingService,
        provideAnimationsAsync(),
        providePrimeNG({
            theme: {
                preset: Aura,
            },
        }),
    ],
})
  .catch(err => console.log(err));
