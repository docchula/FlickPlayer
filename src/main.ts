import { enableProdMode } from '@angular/core';
import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';
import * as Sentry from "@sentry/angular";

import { AppModule } from './app/app.module';
import { environment } from './environments/environment';

if (environment.production) {
  enableProdMode();
  Sentry.init({
    dsn: "https://b820fb54821e887810c19c34cd078c94@o276010.ingest.us.sentry.io/4508653269221376",
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration(),
    ],
    // Tracing
    tracesSampleRate: 0.1, //  Capture 100% of the transactions
    // Set 'tracePropagationTargets' to control for which URLs distributed tracing should be enabled
    tracePropagationTargets: ['https://flick-man-app.docchula.com', 'https://flick-man-cdn.docchula.com'],
    // Session Replay
    replaysSessionSampleRate: 0.01, // This sets the sample rate at 10%. You may want to change it to 100% while in development and then sample at a lower rate in production.
    replaysOnErrorSampleRate: 1.0, // If you're not already sampling the entire session, change the sample rate to 100% when sampling sessions where errors occur.

    // Ignore some errors
    ignoreErrors: [
        'NG04002', // Angular routing error a.k.a. 404
        // Benign Firebase Auth errors
        'auth/cancelled-popup-request', 'auth/popup-blocked', 'auth/popup-closed-by-user',
        'auth/network-request-failed', 'Pending promise was never set',
        // HTTP errors
        ' 401', ' 504',
    ],
  });
}

platformBrowserDynamic().bootstrapModule(AppModule)
  .catch(err => console.log(err));
