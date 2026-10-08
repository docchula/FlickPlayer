import {Component, EventEmitter, inject, Input, Output} from '@angular/core';
import {AsyncPipe} from '@angular/common';
import {IonCheckbox, IonInput} from '@ionic/angular/standalone';
import {map} from 'rxjs/operators';
import {AuthService} from '../auth.service';
import {CreditChoice, LIMITS} from '../study-aids/study-aids.model';

/**
 * The co-author box in the editors. Ticked, readers see the editor's name with the summary or
 * the questions; unticked, the editor stays anonymous, and saving removes a name shown before.
 */
@Component({
    selector: 'app-credit-field',
    templateUrl: './credit-field.component.html',
    styleUrls: ['./credit-field.component.scss'],
    imports: [AsyncPipe, IonCheckbox, IonInput],
})
export class CreditFieldComponent {
    @Input() choice: CreditChoice = {credit: false, name: ''};
    @Output() choiceChange = new EventEmitter<CreditChoice>();
    /** What is being edited, as the hint names it. */
    @Input() part = 'summary';

    protected readonly maxName = LIMITS.creditNameChars;
    protected readonly accountName$ = inject(AuthService).user.pipe(map(user => user?.displayName ?? ''));

    onCredit(event: Event): void {
        this.choiceChange.emit({...this.choice, credit: (event as CustomEvent<{checked: boolean}>).detail.checked});
    }

    onName(event: Event): void {
        this.choiceChange.emit({...this.choice, name: (event as CustomEvent<{value: string | null}>).detail.value ?? ''});
    }
}
