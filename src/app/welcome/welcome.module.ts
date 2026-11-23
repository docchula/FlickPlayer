import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Routes, RouterModule } from '@angular/router';
import { WelcomePage } from './welcome.page';
import {IonButton} from "@ionic/angular/ion-button";
import {IonCard} from "@ionic/angular/ion-card";
import {IonCardContent} from "@ionic/angular/ion-card-content";
import {IonCardHeader} from "@ionic/angular/ion-card-header";
import {IonCardTitle} from "@ionic/angular/ion-card-title";
import {IonContent} from "@ionic/angular/ion-content";
import {IonText} from "@ionic/angular/ion-text";

const routes: Routes = [
    {
        path: '',
        component: WelcomePage
    }
];

@NgModule({
    imports: [
        CommonModule,
        FormsModule,
        RouterModule.forChild(routes),
        IonContent,
        IonCard,
        IonCardHeader,
        IonCardTitle,
        IonCardContent,
        IonButton,
        IonText,
        WelcomePage
    ]
})
export class WelcomePageModule { }
