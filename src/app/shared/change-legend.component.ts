import {Component, Input, OnChanges} from '@angular/core';
import {formatDay} from '../study-aids/byline';
import {authorLabel, changeClass, History} from '../study-aids/changes';

interface LegendEntry {
    key: string;
    label: string;
    colour: string;
    added: number;
    removed: number;
}

/** What the changes are counted from, and which colour is which editor. */
@Component({
    selector: 'app-change-legend',
    templateUrl: './change-legend.component.html',
    styleUrls: ['./change-legend.component.scss'],
})
export class ChangeLegendComponent implements OnChanges {
    @Input({required: true}) history: History;
    /** What changed, as the sentences name it. */
    @Input() part = 'summary';

    protected entries: LegendEntry[] = [];
    protected since = '';

    ngOnChanges(): void {
        const versionOf = (author: number) => this.history.versions.findIndex(version => version.author === author);
        this.entries = this.history.authors
            .map((author, index) => ({
                key: author.key,
                label: authorLabel(this.history, index),
                colour: changeClass(this.history, versionOf(index)),
                added: author.added,
                removed: author.removed,
            }))
            .filter(entry => entry.added || entry.removed);
        const base = this.history.base;
        const when = base.created_at ? ` of ${formatDay(base.created_at)}` : '';
        this.since = base.author === null
            ? `the AI's draft${when}`
            : `the first version${when}, by ${base.author.name ?? 'an editor'}`;
    }
}
