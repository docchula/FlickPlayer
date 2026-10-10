import {Component, EventEmitter, Input, Output} from '@angular/core';

/** `current` is what editors made of the part; `original` the AI's own draft; `changes` the two compared. */
export type PartView = 'current' | 'original' | 'changes';

/** Chooses which version of the summary or the quiz to show. The edited one shows unless the reader asks. */
@Component({
    selector: 'app-version-switch',
    templateUrl: './version-switch.component.html',
    styleUrls: ['./version-switch.component.scss'],
})
export class VersionSwitchComponent {
    @Input() view: PartView = 'current';
    @Output() viewChange = new EventEmitter<PartView>();
    /** Whether the part began as the AI's draft, which can then be shown as the AI wrote it. */
    @Input() fromAi = true;

    choose(view: PartView): void {
        if (view !== this.view) {
            this.view = view;
            this.viewChange.emit(view);
        }
    }
}
