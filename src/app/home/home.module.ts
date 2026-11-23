import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { HomePage } from './home.page';
import { ListPage } from './list/list.page';
import { HomeRoutingModule } from './home-routing.module';
import {IonBackButton} from "@ionic/angular/ion-back-button";
import {IonButton} from "@ionic/angular/ion-button";
import {IonButtons} from "@ionic/angular/ion-buttons";
import {IonCard} from "@ionic/angular/ion-card";
import {IonCardContent} from "@ionic/angular/ion-card-content";
import {IonCardHeader} from "@ionic/angular/ion-card-header";
import {IonCardTitle} from "@ionic/angular/ion-card-title";
import {IonCol} from "@ionic/angular/ion-col";
import {IonContent} from "@ionic/angular/ion-content";
import {IonGrid} from "@ionic/angular/ion-grid";
import {IonHeader} from "@ionic/angular/ion-header";
import {IonIcon} from "@ionic/angular/ion-icon";
import {IonItem} from "@ionic/angular/ion-item";
import {IonLabel} from "@ionic/angular/ion-label";
import {IonList} from "@ionic/angular/ion-list";
import {IonListHeader} from "@ionic/angular/ion-list-header";
import {IonProgressBar} from "@ionic/angular/ion-progress-bar";
import {IonRow} from "@ionic/angular/ion-row";
import {IonText} from "@ionic/angular/ion-text";
import {IonTitle} from "@ionic/angular/ion-title";
import {IonToolbar} from "@ionic/angular/ion-toolbar";

@NgModule({
    imports: [
        CommonModule,
        FormsModule,
        HomeRoutingModule,
        IonHeader,
        IonToolbar,
        IonTitle,
        IonText,
        IonButtons,
        IonButton,
        IonIcon,
        IonContent,
        IonGrid,
        IonRow,
        IonCol,
        IonCard,
        IonCardHeader,
        IonCardTitle,
        IonCardContent,
        IonList,
        IonListHeader,
        IonLabel,
        IonItem,
        IonProgressBar,
        IonBackButton,
        HomePage, 
        ListPage
    ]
})

export class HomePageModule { }
