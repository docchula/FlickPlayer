import {afterNextRender, Component, ElementRef, inject, Injector, Input, OnChanges, ViewEncapsulation} from '@angular/core';
import {renderMath} from '../home/course/markdown-math';

/**
 * HTML rendered from a summary's or a question's Markdown. Angular sanitizes it on the way in, and
 * the maths is drawn afterwards, as KaTeX's output would not survive the sanitizer.
 */
@Component({
    selector: 'app-rich-text',
    templateUrl: './rich-text.component.html',
    styleUrls: ['./rich-text.component.scss'],
    // [innerHTML] content and KaTeX's output carry no scoping attributes, so scoped styles would never match them
    encapsulation: ViewEncapsulation.None,
})
export class RichTextComponent implements OnChanges {
    private host = inject<ElementRef<HTMLElement>>(ElementRef);
    private injector = inject(Injector);

    @Input() html = '';

    ngOnChanges() {
        afterNextRender(() => renderMath(this.host.nativeElement), {injector: this.injector});
    }
}
