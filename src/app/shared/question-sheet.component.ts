import {Component, EventEmitter, Input, OnChanges, Output} from '@angular/core';
import {IonButton, IonIcon} from '@ionic/angular';
import {addIcons} from 'ionicons';
import {checkmarkCircle, playCircleOutline} from 'ionicons/icons';
import {RichTextComponent} from './rich-text.component';
import {formatClock, renderBlock, renderInline} from '../study-aids/checklist';
import {CHOICE_LETTERS} from '../study-aids/quiz';
import {RevisionQuestion} from '../study-aids/study-aids.model';

/** A question with its answer and explanation in view, for reading rather than answering. */
@Component({
    selector: 'app-question-sheet',
    templateUrl: './question-sheet.component.html',
    styleUrls: ['./question-sheet.component.scss'],
    imports: [IonButton, IonIcon, RichTextComponent],
})
export class QuestionSheetComponent implements OnChanges {
    @Input({required: true}) question: RevisionQuestion;
    @Input() number: number | null = null;
    /** Whether the time the topic is taught jumps the video there. */
    @Input() seekable = false;
    @Output() seek = new EventEmitter<number>();

    protected promptHtml = '';
    protected choicesHtml: string[] = [];
    protected explanationHtml: string | null = null;
    protected readonly formatClock = formatClock;

    constructor() {
        addIcons({checkmarkCircle, playCircleOutline});
    }

    ngOnChanges(): void {
        this.promptHtml = renderBlock(this.question.prompt);
        this.choicesHtml = this.question.choices.map(choice => renderInline(choice));
        this.explanationHtml = this.question.explanation ? renderBlock(this.question.explanation) : null;
    }

    letter(index: number): string {
        return CHOICE_LETTERS[index] ?? String(index + 1);
    }
}
