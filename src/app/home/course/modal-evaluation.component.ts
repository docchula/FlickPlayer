import {Component, inject, Input} from '@angular/core';
import {FormsModule} from '@angular/forms';

import {IonButton} from '@ionic/angular/ion-button';
import {IonButtons} from '@ionic/angular/ion-buttons';
import {IonContent} from '@ionic/angular/ion-content';
import {IonHeader} from '@ionic/angular/ion-header';
import {IonItem} from '@ionic/angular/ion-item';
import {IonLabel} from '@ionic/angular/ion-label';
import {IonTitle} from '@ionic/angular/ion-title';
import {IonToolbar} from '@ionic/angular/ion-toolbar';
import {ModalController} from '@ionic/angular/modal-controller';
import {ToastController} from '@ionic/angular/toast-controller';
import {Lecture, ManService} from '../../man.service';
import {Rating} from 'primeng/rating';
import {PrimeNG} from 'primeng/config';
import Aura from '@primeuix/themes/aura';

@Component({
    selector: 'app-modal-evaluation',
    templateUrl: 'modal-evaluation.component.html',
    imports: [FormsModule, IonButton, IonButtons, IonContent, IonHeader, IonItem, IonTitle, IonToolbar, Rating, IonLabel],
})
export class ModalEvaluationComponent {
    private manService = inject(ManService);
    private modalCtrl = inject(ModalController);
    private toastController = inject(ToastController);

    constructor() {
        // This modal is the app's only PrimeNG user. Applying the theme here keeps the preset in
        // this lazily loaded chunk rather than the initial bundle; PrimeNG components restyle
        // themselves when the theme changes, so the order does not matter.
        const primeng = inject(PrimeNG);
        if (!primeng.theme()) {
            primeng.setThemeConfig({theme: {preset: Aura}});
        }
    }

    @Input() video: Lecture;
    result: {
        delivery: number | null;
        material: number | null;
        video: number | null;
    } = {
        delivery: null,
        material: null,
        video: null,
    };

    cancel() {
        return this.modalCtrl.dismiss(null, 'cancel');
    }

    confirm() {
        if (this.video && (this.result.delivery || this.result.material || this.result.video)) {
            this.manService.sendEvaluation('end_play', this.video.id, this.result).subscribe(res => {
                if (res.status === 'success') {
                    void this.presentToast();
                }
            });
        }
        return this.modalCtrl.dismiss(this.result, 'confirm');
    }

    async presentToast() {
        const toast = await this.toastController.create({
            message: 'Evaluation saved, thank you!',
            duration: 1500,
            position: 'bottom',
        });

        await toast.present();
    }
}
