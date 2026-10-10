import {Component, EventEmitter, inject, Input, Output} from '@angular/core';
import {AsyncPipe} from '@angular/common';
import {AlertController, IonButton, IonCheckbox, IonInput, IonSpinner} from '@ionic/angular/standalone';
import {firstValueFrom} from 'rxjs';
import {StudyAidsService} from '../study-aids.service';
import {formatDay} from '../study-aids/byline';
import {describeFailure} from '../study-aids/failures';
import {EditorProfile, LIMITS, SaveFailure} from '../study-aids/study-aids.model';

/**
 * The co-author box in the editors. Ticked, readers see the editor's display name with the summary
 * or the questions; unticked, the editor stays anonymous, and saving removes a name shown before.
 * The display name is also changed here, which FlickMan allows once every 30 days.
 */
@Component({
    selector: 'app-credit-field',
    templateUrl: './credit-field.component.html',
    styleUrls: ['./credit-field.component.scss'],
    imports: [AsyncPipe, IonButton, IonCheckbox, IonInput, IonSpinner],
})
export class CreditFieldComponent {
    private service = inject(StudyAidsService);
    private alertCtrl = inject(AlertController);

    @Input() credit = false;
    @Output() creditChange = new EventEmitter<boolean>();
    /** What is being edited, as the hint names it. */
    @Input() part = 'summary';

    protected readonly profile$ = this.service.profile();
    protected readonly maxName = LIMITS.displayNameChars;
    protected renaming = false;
    protected name = '';
    protected saving = false;
    protected problem: string | null = null;

    onCredit(event: Event): void {
        this.creditChange.emit((event as CustomEvent<{checked: boolean}>).detail.checked);
    }

    /** When the name can next be changed, or null when it can be now. */
    lockedUntil(profile: EditorProfile): string | null {
        return profile.next_change_at && Date.parse(profile.next_change_at) > Date.now() ? formatDay(profile.next_change_at) : null;
    }

    rename(profile: EditorProfile): void {
        this.name = profile.name;
        this.problem = null;
        this.renaming = true;
    }

    onName(event: Event): void {
        this.name = (event as CustomEvent<{value: string | null}>).detail.value ?? '';
    }

    cancelRename(): void {
        this.renaming = false;
        this.problem = null;
    }

    async saveName(event: Event, profile: EditorProfile): Promise<void> {
        event.preventDefault();
        const name = this.name.replace(/\s+/g, ' ').trim();
        if (!name || name === profile.name) {
            this.cancelRename();

            return;
        }
        const alert = await this.alertCtrl.create({
            header: 'Change your display name?',
            message: `Students will see "${name}" instead of "${profile.name}". You can only change it once every 30 days.`,
            buttons: [
                {text: 'Cancel', role: 'cancel'},
                {text: 'Change', role: 'confirm'},
            ],
        });
        await alert.present();
        if ((await alert.onDidDismiss()).role !== 'confirm') {
            return;
        }
        this.saving = true;
        this.problem = null;
        try {
            await firstValueFrom(this.service.saveProfile(name));
            this.renaming = false;
        } catch (failure) {
            this.problem = describeFailure(failure as SaveFailure);
        } finally {
            this.saving = false;
        }
    }
}
