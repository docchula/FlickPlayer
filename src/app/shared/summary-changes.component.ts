import {Component, EventEmitter, Input, Output, ViewEncapsulation} from '@angular/core';
import {NgTemplateOutlet} from '@angular/common';
import {IonIcon} from '@ionic/angular/standalone';
import {addIcons} from 'ionicons';
import {play} from 'ionicons/icons';
import {RichTextComponent} from './rich-text.component';
import {ChangeRunsComponent} from './change-runs.component';
import {ChangeLegendComponent} from './change-legend.component';
import {formatClock} from '../study-aids/checklist';
import {ChangedBlock, changeClass, describeChange, SummaryChanges} from '../study-aids/changes';

/** The summary laid out as the checklist, with what each editor added and removed marked in place. */
@Component({
    selector: 'app-summary-changes',
    templateUrl: './summary-changes.component.html',
    styleUrls: ['./summary-changes.component.scss'],
    // The blocks arrive as HTML, which scoped styles would never reach
    encapsulation: ViewEncapsulation.None,
    imports: [NgTemplateOutlet, IonIcon, RichTextComponent, ChangeRunsComponent, ChangeLegendComponent],
})
export class SummaryChangesComponent {
    @Input({required: true}) changes: SummaryChanges;
    /** Whether a section's time jumps the video there. */
    @Input() seekable = false;
    @Output() seek = new EventEmitter<number>();

    protected readonly formatClock = formatClock;

    constructor() {
        addIcons({play});
    }

    /** The classes that mark a block added or removed whole, in the colour of who did it. */
    wholeClass(block: ChangedBlock): string {
        return block.change === 'added' || block.change === 'removed'
            ? `whole-${block.change} ${changeClass(this.changes, block.version)}`
            : '';
    }

    /** "Added by Kan on 9 Oct 2026", said of a whole block. */
    wholeTag(block: ChangedBlock): string | null {
        return block.change === 'added' || block.change === 'removed' ? describeChange(this.changes, block.change, block.version) : null;
    }
}
