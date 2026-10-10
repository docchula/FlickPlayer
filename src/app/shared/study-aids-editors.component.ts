import {Component, inject, Input, OnInit} from '@angular/core';
import {
    AlertController,
    IonButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonInput,
    IonItem,
    IonLabel,
    IonList,
    IonSelect,
    IonSelectOption,
    IonSpinner,
    IonTitle,
    IonToolbar,
    ModalController,
} from '@ionic/angular';
import {firstValueFrom, Observable} from 'rxjs';
import {take} from 'rxjs/operators';
import {AuthService} from '../auth.service';
import {StudyAidsService} from '../study-aids.service';
import {describeFailure} from '../study-aids/failures';
import {EditorRole, SaveFailure, StudyAidsEditor} from '../study-aids/study-aids.model';

/** Flick only signs in Docchula Google accounts, so nobody else could use the access. */
const DOCCHULA_EMAIL = /^[^\s@]+@docchula\.com$/i;

function eventValue<T>(event: Event): T {
    return (event as CustomEvent<{value: T}>).detail.value;
}

function byRole(a: StudyAidsEditor, b: StudyAidsEditor): number {
    return (a.role === b.role ? 0 : a.role === 'admin' ? -1 : 1) || (a.name ?? a.email).localeCompare(b.name ?? b.email);
}

export async function openEditorsList(modalCtrl: ModalController, videoId: number): Promise<void> {
    const modal = await modalCtrl.create({component: StudyAidsEditorsComponent, componentProps: {videoId}});
    await modal.present();
}

/** Admins choose here who may edit the summaries and questions of every lecture. */
@Component({
    selector: 'app-study-aids-editors',
    templateUrl: './study-aids-editors.component.html',
    styleUrls: ['./study-aids-editors.component.scss'],
    imports: [
        IonHeader,
        IonToolbar,
        IonTitle,
        IonButtons,
        IonButton,
        IonContent,
        IonInput,
        IonSelect,
        IonSelectOption,
        IonList,
        IonItem,
        IonLabel,
        IonSpinner,
    ],
})
export class StudyAidsEditorsComponent implements OnInit {
    private service = inject(StudyAidsService);
    private modalCtrl = inject(ModalController);
    private alertCtrl = inject(AlertController);

    /** The lecture this was opened from, whose permissions are reloaded when the admin's own change. */
    @Input() videoId: number;

    protected editors: StudyAidsEditor[] = [];
    protected loading = true;
    protected busy = false;
    protected problem: string | null = null;
    protected email = '';
    protected role: EditorRole = 'editor';
    private myEmail = '';

    constructor() {
        inject(AuthService).user.pipe(take(1)).subscribe(user => this.myEmail = (user?.email ?? '').toLowerCase());
    }

    ngOnInit(): void {
        void this.load();
    }

    isMe(editor: StudyAidsEditor): boolean {
        return editor.email.toLowerCase() === this.myEmail;
    }

    onEmail(event: Event): void {
        this.email = eventValue<string | null>(event) ?? '';
    }

    onRole(event: Event): void {
        this.role = eventValue<EditorRole>(event);
    }

    async add(event: Event): Promise<void> {
        event.preventDefault();
        const email = this.email.trim().toLowerCase();
        if (!DOCCHULA_EMAIL.test(email)) {
            this.problem = 'Enter their @docchula.com address.';

            return;
        }
        await this.change(this.service.saveEditor(email, this.role), email, editor => {
            this.editors = [...this.editors.filter(other => other.email !== editor.email), editor].sort(byRole);
            this.email = '';
        });
    }

    async changeRole(editor: StudyAidsEditor, event: Event): Promise<void> {
        const role = eventValue<EditorRole>(event);
        if (role === editor.role) {
            return;
        }
        if (this.isMe(editor) && !(await this.confirm('Stop being an admin?', 'You will no longer be able to choose the editors.', 'Stop'))) {
            // Redraws the select with the role that still applies.
            this.editors = [...this.editors];

            return;
        }
        await this.change(this.service.saveEditor(editor.email, role), editor.email, saved => {
            this.editors = this.editors.map(other => other.email === saved.email ? saved : other).sort(byRole);
        });
    }

    async remove(editor: StudyAidsEditor): Promise<void> {
        const confirmed = this.isMe(editor)
            ? await this.confirm('Remove yourself?', 'You will no longer be able to edit summaries and questions.', 'Remove')
            : await this.confirm(`Remove ${editor.name ?? editor.email}?`, 'They will no longer be able to edit summaries and questions.', 'Remove');
        if (confirmed) {
            await this.change(this.service.removeEditor(editor.email), editor.email, () => {
                this.editors = this.editors.filter(other => other.email !== editor.email);
            });
        }
    }

    close(): void {
        void this.modalCtrl.dismiss();
    }

    private async load(): Promise<void> {
        try {
            this.editors = (await firstValueFrom(this.service.editors())).sort(byRole);
        } catch (failure) {
            this.problem = (failure as SaveFailure).kind === 'forbidden'
                ? 'Only admins can see and change the editors.'
                : describeFailure(failure as SaveFailure);
        } finally {
            this.loading = false;
        }
    }

    private async change<T>(request: Observable<T>, email: string, apply: (result: T) => void): Promise<void> {
        this.busy = true;
        this.problem = null;
        try {
            apply(await firstValueFrom(request));
            if (email === this.myEmail) {
                // Their own access changed, so the cards behind should show what they can do now.
                this.service.refresh(this.videoId);
                if (!this.editors.some(editor => this.isMe(editor) && editor.role === 'admin')) {
                    this.close();
                }
            }
        } catch (failure) {
            this.problem = describeFailure(failure as SaveFailure);
            this.editors = [...this.editors];
        } finally {
            this.busy = false;
        }
    }

    private async confirm(header: string, message: string, action: string): Promise<boolean> {
        const alert = await this.alertCtrl.create({
            header,
            message,
            buttons: [
                {text: 'Cancel', role: 'cancel'},
                {text: action, role: 'destructive'},
            ],
        });
        await alert.present();

        return (await alert.onDidDismiss()).role === 'destructive';
    }
}
