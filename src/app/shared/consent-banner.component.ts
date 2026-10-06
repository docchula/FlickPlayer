import {Component, inject} from '@angular/core';
import {IonButton} from '@ionic/angular/standalone';
import {AsyncPipe} from '@angular/common';
import {RouterLink} from '@angular/router';
import {ConsentService} from '../consent.service';

@Component({
    selector: 'app-consent-banner',
    template: `
        @if ((consentService.status$ | async) === 'unset') {
            <div class="consent-banner">
                <p>
                    This app uses analytics, linked to your account, to understand feature usage and
                    improve the experience. See our
                    <a routerLink="/privacy-policy">Privacy Policy</a> for details.
                </p>
                <div class="consent-actions">
                    <ion-button fill="clear" size="small" (click)="decline()">Decline</ion-button>
                    <ion-button size="small" (click)="accept()">Accept</ion-button>
                </div>
            </div>
        }
    `,
    styles: [`
        .consent-banner {
            position: fixed;
            left: 0;
            right: 0;
            bottom: 0;
            z-index: 999999;
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            gap: 0.75rem;
            padding: 0.75rem 1rem;
            background: var(--ion-color-dark, #222428);
            color: var(--ion-color-dark-contrast, #ffffff);
            box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.3);
        }

        p {
            flex: 1 1 240px;
            margin: 0;
            font-size: 0.85rem;
            line-height: 1.4;
        }

        a {
            color: var(--ion-color-primary-tint, #6ea8fe);
        }

        .consent-actions {
            display: flex;
            gap: 0.5rem;
            flex: 0 0 auto;
        }
    `],
    imports: [IonButton, AsyncPipe, RouterLink],
})
export class ConsentBannerComponent {
    consentService = inject(ConsentService);

    accept(): void {
        this.consentService.grant();
    }

    decline(): void {
        this.consentService.deny();
    }
}
