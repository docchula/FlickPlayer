import {Component, inject, Input} from '@angular/core';
import {FormsModule} from '@angular/forms';

import {IonButton, IonButtons, IonContent, IonHeader, IonItem, IonLabel, IonTitle, IonToolbar, ModalController} from '@ionic/angular/standalone';
import {Lecture, ManService} from '../../man.service';
import {Rating} from 'primeng/rating';
import {ToastController} from '@ionic/angular';

@Component({
    selector: 'app-modal-evaluation',
    templateUrl: 'modal-evaluation.component.html',
    imports: [FormsModule, IonButton, IonButtons, IonContent, IonHeader, IonItem, IonTitle, IonToolbar, Rating, IonLabel],
})
export class ModalEvaluationComponent {
    private manService = inject(ManService);
    private modalCtrl = inject(ModalController);
    private toastController = inject(ToastController);

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
