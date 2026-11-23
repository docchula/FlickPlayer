import {Component} from '@angular/core';
import {IonBackButton} from '@ionic/angular/ion-back-button';
import {IonButtons} from '@ionic/angular/ion-buttons';
import {IonContent} from '@ionic/angular/ion-content';
import {IonHeader} from '@ionic/angular/ion-header';
import {IonTitle} from '@ionic/angular/ion-title';
import {IonToolbar} from '@ionic/angular/ion-toolbar';

@Component({
    selector: 'app-privacy-policy',
    templateUrl: './privacy-policy.page.html',
    styleUrls: ['./privacy-policy.page.scss'],
    imports: [IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonContent],
})
export class PrivacyPolicyPage {
    lastUpdated = '2026-09-05';
}
