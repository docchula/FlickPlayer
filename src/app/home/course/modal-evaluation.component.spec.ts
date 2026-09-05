import {TestBed} from '@angular/core/testing';
import {ModalController} from '@ionic/angular/standalone';
import {ToastController} from '@ionic/angular';
import {of} from 'rxjs';
import {ModalEvaluationComponent} from './modal-evaluation.component';
import {ManService} from '../../man.service';

describe('ModalEvaluationComponent.confirm', () => {
    let component: ModalEvaluationComponent;
    let manService: jasmine.SpyObj<Pick<ManService, 'sendEvaluation'>>;
    let modalCtrl: jasmine.SpyObj<Pick<ModalController, 'dismiss'>>;
    let toastCtrl: jasmine.SpyObj<Pick<ToastController, 'create'>>;

    beforeEach(() => {
        manService = jasmine.createSpyObj('ManService', ['sendEvaluation']);
        modalCtrl = jasmine.createSpyObj('ModalController', ['dismiss']);
        toastCtrl = jasmine.createSpyObj('ToastController', ['create']);
        toastCtrl.create.and.returnValue(Promise.resolve({present: () => Promise.resolve()}) as never);

        TestBed.configureTestingModule({
            providers: [
                ModalEvaluationComponent,
                {provide: ManService, useValue: manService},
                {provide: ModalController, useValue: modalCtrl},
                {provide: ToastController, useValue: toastCtrl},
            ],
        });
        component = TestBed.inject(ModalEvaluationComponent);
    });

    it('does not send an evaluation when no video is set', () => {
        component.video = undefined;
        component.result = {delivery: 4, material: 4, video: 4};

        component.confirm();

        expect(manService.sendEvaluation).not.toHaveBeenCalled();
        expect(modalCtrl.dismiss).toHaveBeenCalledWith(component.result, 'confirm');
    });

    it('does not send an evaluation when all ratings are null', () => {
        component.video = {id: 1} as never;
        component.result = {delivery: null, material: null, video: null};

        component.confirm();

        expect(manService.sendEvaluation).not.toHaveBeenCalled();
        expect(modalCtrl.dismiss).toHaveBeenCalledWith(component.result, 'confirm');
    });

    it('sends an evaluation when at least one rating is set, and dismisses either way', () => {
        component.video = {id: 1} as never;
        component.result = {delivery: null, material: 3, video: null};
        manService.sendEvaluation.and.returnValue(of({status: 'success'}) as never);

        component.confirm();

        expect(manService.sendEvaluation).toHaveBeenCalledWith('end_play', 1, component.result);
        expect(modalCtrl.dismiss).toHaveBeenCalledWith(component.result, 'confirm');
    });

    it('shows a toast only when the evaluation response status is success', () => {
        component.video = {id: 1} as never;
        component.result = {delivery: 5, material: null, video: null};
        manService.sendEvaluation.and.returnValue(of({status: 'error'}) as never);

        component.confirm();

        expect(toastCtrl.create).not.toHaveBeenCalled();
    });

    it('cancel() dismisses with the cancel role and no result', () => {
        component.cancel();

        expect(modalCtrl.dismiss).toHaveBeenCalledWith(null, 'cancel');
    });
});
