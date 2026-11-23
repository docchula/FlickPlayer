import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { HomePage } from './home.page';
import { ListPage } from './list/list.page';
import { HomeRoutingModule } from './home-routing.module';
import { IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonIcon, IonContent, IonGrid, IonRow, IonCol, IonCard, IonCardHeader, IonCardTitle, IonBackButton, IonText, IonCardContent, IonList, IonListHeader, IonLabel, IonItem, IonProgressBar } from "@ionic/angular";

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
