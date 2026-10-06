import {Component} from '@angular/core';
import {IonBackButton, IonButtons, IonContent, IonHeader, IonTitle, IonToolbar} from '@ionic/angular/standalone';

@Component({
    selector: 'app-privacy-policy',
    templateUrl: './privacy-policy.page.html',
    styleUrls: ['./privacy-policy.page.scss'],
    imports: [IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonContent],
})
export class PrivacyPolicyPage {
    lastUpdated = '2026-09-05';
}
