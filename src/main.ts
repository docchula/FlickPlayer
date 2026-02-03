import {enableProdMode, importProvidersFrom} from '@angular/core';

import {environment} from './environments/environment';
import {RouteReuseStrategy} from '@angular/router';
import {IonicRouteStrategy, provideIonicAngular} from '@ionic/angular/standalone';
import {DEBUG_MODE, UserTrackingService} from '@angular/fire/compat/analytics';
import {INSTRUMENTATION_ENABLED} from '@angular/fire/compat/performance';
import {DEFAULTS} from '@angular/fire/compat/remote-config';
import {initializeApp, provideFirebaseApp} from '@angular/fire/app';
import {getFirestore, provideFirestore} from '@angular/fire/firestore';
import {getAuth, provideAuth} from '@angular/fire/auth';
import {getAnalytics, provideAnalytics, ScreenTrackingService, UserTrackingService as UserTrackingService_alias} from '@angular/fire/analytics';
import {getPerformance, providePerformance} from '@angular/fire/performance';
import {getRemoteConfig, provideRemoteConfig} from '@angular/fire/remote-config';
import {provideHttpClient, withFetch, withInterceptorsFromDi} from '@angular/common/http';
import {provideAnimationsAsync} from '@angular/platform-browser/animations/async';
import {providePrimeNG} from 'primeng/config';
import {bootstrapApplication, BrowserModule} from '@angular/platform-browser';
import {AppRoutingModule} from './app/app-routing.module';
import {WelcomePageModule} from './app/welcome/welcome.module';
import {ServiceWorkerModule} from '@angular/service-worker';
import {AppComponent} from './app/app.component';
import Aura from '@primeuix/themes/aura';

if (environment.production) {
  enableProdMode();
}

bootstrapApplication(AppComponent, {
    providers: [
        importProvidersFrom(BrowserModule, AppRoutingModule, WelcomePageModule, ServiceWorkerModule.register('ngsw-worker.js', {enabled: environment.production})),
        {provide: RouteReuseStrategy, useClass: IonicRouteStrategy},
        UserTrackingService,
        {provide: INSTRUMENTATION_ENABLED, useValue: environment.production},
        {provide: DEBUG_MODE, useValue: !environment.production},
        {provide: DEFAULTS, useValue: environment.defaultRemoteConfig},
        provideIonicAngular(),
        provideFirebaseApp(() => initializeApp(environment.firebase)),
        provideFirestore(() => getFirestore()),
        provideAuth(() => getAuth()),
        provideAnalytics(() => getAnalytics()),
        providePerformance(() => getPerformance()),
        provideRemoteConfig(() => getRemoteConfig()),
        provideHttpClient(withFetch(), withInterceptorsFromDi()),
        ScreenTrackingService,
        UserTrackingService_alias,
        provideAnimationsAsync(),
        providePrimeNG({
            theme: {
                preset: Aura,
            },
        }),
    ],
})
  .catch(err => console.log(err));
