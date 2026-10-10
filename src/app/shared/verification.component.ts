import {Component, inject, Input} from '@angular/core';
import {AsyncPipe} from '@angular/common';
import {AlertController, IonButton, IonIcon, IonSpinner} from '@ionic/angular';
import {addIcons} from 'ionicons';
import {shieldCheckmark, shieldOutline} from 'ionicons/icons';
import {firstValueFrom, Observable} from 'rxjs';
import {StudyAidsService} from '../study-aids.service';
import {formatDay, verifiedLine, verifiedState} from '../study-aids/byline';
import {describeFailure} from '../study-aids/failures';
import {EditorProfile, PartMeta, PartName, SaveFailure} from '../study-aids/study-aids.model';

/**
 * Who checked the summary or the quiz against the lecture. Editors and admins mark the version on
 * show as verified here, under their display name, or take their own mark back.
 */
@Component({
    selector: 'app-verification',
    templateUrl: './verification.component.html',
    styleUrls: ['./verification.component.scss'],
    imports: [AsyncPipe, IonButton, IonIcon, IonSpinner],
})
export class VerificationComponent {
    private service = inject(StudyAidsService);
    private alertCtrl = inject(AlertController);

    @Input({required: true}) videoId: number;
    @Input({required: true}) part: PartMeta;
    @Input({required: true}) name: PartName;
    @Input() canEdit = false;

    protected busy = false;
    protected problem: string | null = null;
    protected readonly verifiedLine = verifiedLine;
    protected readonly verifiedState = verifiedState;
    private profile$: Observable<EditorProfile | null> | null = null;

    /** Only asked for when the reader is an editor. */
    protected get myProfile$(): Observable<EditorProfile | null> {
        return this.profile$ ??= this.service.profile();
    }

    constructor() {
        addIcons({shieldCheckmark, shieldOutline});
    }

    when(): string | null {
        return this.part.verified?.at ? formatDay(this.part.verified.at) : null;
    }

    /** Whether this editor is among those who verified the version on show. */
    verifiedByMe(profile: EditorProfile | null): boolean {
        return !!profile && verifiedState(this.part) === 'current'
            && !!this.part.verified?.by.some(verifier => verifier.name === profile.name);
    }

    async verify(profile: EditorProfile | null): Promise<void> {
        const alert = await this.alertCtrl.create({
            header: `Verify this ${this.name}?`,
            message: `Only verify it once you have checked it against the lecture. Students will see "Verified by ${profile?.name ?? 'you'}".`,
            buttons: [
                {text: 'Cancel', role: 'cancel'},
                {text: 'Verify', role: 'confirm'},
            ],
        });
        await alert.present();
        if ((await alert.onDidDismiss()).role === 'confirm') {
            await this.send(true);
        }
    }

    async unverify(): Promise<void> {
        await this.send(false);
    }

    private async send(verified: boolean): Promise<void> {
        this.busy = true;
        this.problem = null;
        try {
            await firstValueFrom(this.service.verify(this.videoId, this.name, this.part.revision, verified));
        } catch (failure) {
            this.problem = (failure as SaveFailure).kind === 'conflict'
                ? `The ${this.name} changed since you opened it. Check the new version before verifying it.`
                : describeFailure(failure as SaveFailure);
        } finally {
            this.busy = false;
        }
    }
}
