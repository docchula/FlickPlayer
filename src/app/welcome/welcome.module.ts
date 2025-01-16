import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Routes, RouterModule } from '@angular/router';
import { WelcomePage } from './welcome.page';
import { IonContent, IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonButton, IonText } from "@ionic/angular/standalone";

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
