import {Component, EventEmitter, Input, OnChanges, Output, ViewEncapsulation} from '@angular/core';
import {ChangeRunsComponent} from './change-runs.component';
import {ChangeLegendComponent} from './change-legend.component';
import {QuestionSheetComponent} from './question-sheet.component';
import {plainText} from '../study-aids/checklist';
import {ChangedField, ChangedQuestion, changeClass, describeChange, QuizChanges} from '../study-aids/changes';

/** Every question with what editors changed in it marked, the removed ones after the rest. */
@Component({
    selector: 'app-quiz-changes',
    templateUrl: './quiz-changes.component.html',
    styleUrls: ['./quiz-changes.component.scss'],
    // The marks sit inside the runs component, which scoped styles would not reach
    encapsulation: ViewEncapsulation.None,
    imports: [ChangeRunsComponent, ChangeLegendComponent, QuestionSheetComponent],
})
export class QuizChangesComponent implements OnChanges {
    @Input({required: true}) changes: QuizChanges;
    @Input() seekable = false;
    @Output() seek = new EventEmitter<number>();

    protected prompts = new Map<string, string>();

    ngOnChanges(): void {
        this.prompts = new Map(this.changes.questions.map(item => [item.id, plainText(item.question.prompt)]));
    }

    wholeClass(item: ChangedQuestion | ChangedField): string {
        return item.change === 'added' || item.change === 'removed'
            ? `whole-${item.change} ${changeClass(this.changes, item.version)}`
            : '';
    }

    wholeTag(item: ChangedQuestion): string | null {
        return item.change === 'added' || item.change === 'removed' ? describeChange(this.changes, item.change, item.version) : null;
    }
}
