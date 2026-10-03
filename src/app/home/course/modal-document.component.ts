import {afterNextRender, Component, ElementRef, inject, Injector, Input, OnInit, ViewEncapsulation} from '@angular/core';
import {
    IonButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonNote,
    IonSpinner,
    IonTitle,
    IonToolbar,
    ModalController,
} from '@ionic/angular/standalone';
import {Lecture, ManService} from '../../man.service';
import {markedWithMath, renderMath} from './markdown-math';

// Matches a leading YAML frontmatter block: `---` ... `---` at the very start of the document.
const FRONTMATTER = /^\uFEFF?---[ \t]*\r?\n[\s\S]*?\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/;

export interface DocHeading {
    index: number; // position among the rendered h1-h3 elements
    text: string;
    level: number;
}

export function stripFrontmatter(markdown: string): string {
    return markdown.replace(FRONTMATTER, '');
}

const unquote =(value: string | undefined) => value?.trim().replace(/^(["'])(.*)\1$/, '$2') || null;

// Reads the AI model names from the frontmatter without a full YAML parser (only two simple scalar fields are needed).
export function extractModels(markdown: string): {transcription: string | null, article: string | null} {
    const frontmatter = markdown.match(FRONTMATTER)?.[0] ?? '';
    return {
        transcription: unquote(frontmatter.match(/^transcription:[ \t]*\r?\n(?:[ \t]+.*\r?\n)*?[ \t]+model:[ \t]*(.+?)[ \t]*\r?$/m)?.[1]),
        article: unquote(frontmatter.match(/^article_model:[ \t]*(.+?)[ \t]*\r?$/m)?.[1]),
    };
}

@Component({
    selector: 'app-modal-document',
    templateUrl: 'modal-document.component.html',
    styleUrls: ['modal-document.component.scss'],
    // [innerHTML] content doesn't get Angular's scoping attributes, so scoped styles would never match it
    encapsulation: ViewEncapsulation.None,
    imports: [IonButton, IonButtons, IonContent, IonHeader, IonNote, IonSpinner, IonTitle, IonToolbar],
})
export class ModalDocumentComponent implements OnInit {
    private manService = inject(ManService);
    private modalCtrl = inject(ModalController);
    private host = inject<ElementRef<HTMLElement>>(ElementRef);
    private injector = inject(Injector);

    @Input() video: Lecture;

    loading = true;
    error = false;
    // Angular's [innerHTML] sanitizes this before rendering.
    html = '';
    models: {transcription: string | null, article: string | null} = {transcription: null, article: null};
    headings: DocHeading[] = [];
    activeHeading = -1;

    ngOnInit() {
        this.manService.getVideo(String(this.video.id)).subscribe({
            next: info => {
                const document = info?.document?.trim();
                if (document) {
                    this.models = extractModels(document);
                    ({html: this.html, headings: this.headings} = this.addHeadingIds(
                        markedWithMath.parse(stripFrontmatter(document), {async: false}),
                    ));
                    // The math placeholders only exist in the DOM once the sanitized HTML has been rendered.
                    afterNextRender(() => renderMath(this.host.nativeElement), {injector: this.injector});
                    this.activeHeading = this.headings.length ? 0 : -1;
                }
                this.loading = false;
            },
            error: () => {
                this.error = true;
                this.loading = false;
            },
        });
    }

    // Collect h1-h3 for the outline. The sanitizer strips id attributes, so headings are looked up by index later.
    private addHeadingIds(html: string): {html: string, headings: DocHeading[]} {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const headings: DocHeading[] = [];
        doc.body.querySelectorAll('h1, h2, h3').forEach((el, index) => {
            headings.push({index, text: el.textContent?.trim() ?? '', level: Number(el.tagName[1])});
        });
        return {html: doc.body.innerHTML, headings};
    }

    private renderedHeadings(): HTMLElement[] {
        return Array.from(this.host.nativeElement.querySelectorAll<HTMLElement>('.markdown-body :is(h1, h2, h3)'));
    }

    scrollTo(index: number) {
        this.activeHeading = index;
        this.renderedHeadings()[index]?.scrollIntoView({behavior: 'smooth', block: 'start'});
    }

    // Highlight the last heading that has scrolled past the top of the content area.
    onScroll(event: Event) {
        const top = (event.target as HTMLElement).getBoundingClientRect().top + 60;
        let active = this.headings.length ? 0 : -1;
        this.renderedHeadings().forEach((el, i) => {
            if (el.getBoundingClientRect().top <= top) {
                active = i;
            }
        });
        this.activeHeading = active;
    }

    close() {
        return this.modalCtrl.dismiss(null, 'cancel');
    }
}
