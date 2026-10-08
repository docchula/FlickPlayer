import {Component, EventEmitter, Input, Output, ViewEncapsulation} from '@angular/core';
import {IonIcon} from '@ionic/angular/standalone';
import {addIcons} from 'ionicons';
import {play} from 'ionicons/icons';
import {RichTextComponent} from './rich-text.component';
import {Checklist, formatClock} from '../study-aids/checklist';

export interface TickChange {
    key: string;
    ticked: boolean;
}

/** A summary laid out as a checklist: highlighted sections, points numbered straight through. */
@Component({
    selector: 'app-checklist-view',
    templateUrl: './checklist-view.component.html',
    styleUrls: ['./checklist-view.component.scss'],
    // The points arrive as HTML, which scoped styles would never reach
    encapsulation: ViewEncapsulation.None,
    imports: [IonIcon, RichTextComponent],
    host: {'[class.with-ticks]': '!!ticked'},
})
export class ChecklistViewComponent {
    @Input() checklist: Checklist;
    /** The points this reader has ticked, or null to show the summary without boxes. */
    @Input() ticked: ReadonlySet<string> | null = null;
    /** Whether a section's time jumps the video there, rather than only being shown. */
    @Input() seekable = false;
    @Output() tickChange = new EventEmitter<TickChange>();
    @Output() seek = new EventEmitter<number>();

    protected readonly formatClock = formatClock;

    constructor() {
        addIcons({play});
    }

    onTick(key: string, event: Event): void {
        this.tickChange.emit({key, ticked: (event.target as HTMLInputElement).checked});
    }
}
