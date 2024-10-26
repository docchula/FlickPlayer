import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { RouteReuseStrategy } from '@angular/router';

import { IonicRouteStrategy, provideIonicAngular, IonApp, IonRouterOutlet } from '@ionic/angular/standalone';

import { AppComponent } from './app.component';
import { AppRoutingModule } from './app-routing.module';
import { environment } from '../environments/environment';
import { WelcomePageModule } from './welcome/welcome.module';
import { HttpClientModule } from '@angular/common/http';
import { ServiceWorkerModule } from '@angular/service-worker';
import { DEBUG_MODE, UserTrackingService } from '@angular/fire/compat/analytics';
import { INSTRUMENTATION_ENABLED } from '@angular/fire/compat/performance';
import { DEFAULTS } from '@angular/fire/compat/remote-config';
import { initializeApp, provideFirebaseApp } from '@angular/fire/app';
import { getAuth, provideAuth } from '@angular/fire/auth';
import { getAnalytics, provideAnalytics } from '@angular/fire/analytics';
import { getPerformance, providePerformance } from '@angular/fire/performance';
import { getRemoteConfig, provideRemoteConfig } from '@angular/fire/remote-config';
import { getFirestore, provideFirestore } from '@angular/fire/firestore';

@NgModule({
    declarations: [AppComponent],
    imports: [
        BrowserModule,
        AppRoutingModule,
        HttpClientModule,
        WelcomePageModule,
        ServiceWorkerModule.register('ngsw-worker.js', { enabled: environment.production }),
        IonApp,
        IonRouterOutlet
    ],
    providers: [
        { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
        UserTrackingService,
        { provide: INSTRUMENTATION_ENABLED, useValue: environment.production },
        { provide: DEBUG_MODE, useValue: !environment.production },
        { provide: DEFAULTS, useValue: environment.defaultRemoteConfig },
        provideIonicAngular(),
        provideFirebaseApp(() => initializeApp(environment.firebase)),
        provideFirestore(() => getFirestore()),
        provideAuth(() => getAuth()),
        provideAnalytics(() => getAnalytics()),
        providePerformance(() => getPerformance()),
        provideRemoteConfig(() => getRemoteConfig()),
    ],
    bootstrap: [AppComponent]
})
export class AppModule {
}
