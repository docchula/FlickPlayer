import {Component, Input} from '@angular/core';
import {ChangeRun, changeClass, describeChange, History} from '../study-aids/changes';

/** A line of text with the words editors added underlined and those they removed struck through. */
@Component({
    selector: 'app-change-runs',
    templateUrl: './change-runs.component.html',
    styleUrls: ['./change-runs.component.scss'],
})
export class ChangeRunsComponent {
    @Input({required: true}) runs: ChangeRun[];
    @Input({required: true}) history: History;

    protected readonly changeClass = changeClass;
    protected readonly describeChange = describeChange;
}
