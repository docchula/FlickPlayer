import {Component, Input} from '@angular/core';
import {FormsModule} from '@angular/forms';

import {IonButton, IonButtons, IonContent, IonHeader, IonItem, IonLabel, IonTitle, IonToolbar, ModalController} from '@ionic/angular/standalone';
import {Lecture, ManService} from '../../man.service';
import {Rating} from 'primeng/rating';

@Component({
    selector: 'app-modal-evaluation',
    templateUrl: 'modal-evaluation.component.html',
    imports: [FormsModule, IonButton, IonButtons, IonContent, IonHeader, IonItem, IonTitle, IonToolbar, Rating, IonLabel],
})
export class ModalEvaluationComponent {
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

    constructor(private manService: ManService, private modalCtrl: ModalController) {
    }

    cancel() {
        return this.modalCtrl.dismiss(null, 'cancel');
    }

    confirm() {
        if (this.video && (this.result.delivery || this.result.material || this.result.video)) {
            this.manService.sendEvaluation('end_play', this.video.id, this.result).subscribe();
        }
        return this.modalCtrl.dismiss(this.result, 'confirm');
    }
}
