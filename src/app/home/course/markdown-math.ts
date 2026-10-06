import katex from 'katex';
import {Marked, MarkedExtension} from 'marked';

const escapeHtml = (text: string) =>
    text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Math is emitted as a placeholder carrying the raw TeX as text, because Angular's [innerHTML] sanitizer would strip
// KaTeX's inline styles and MathML. renderMath() turns the placeholders into KaTeX markup after sanitizing.
const INLINE_CLASS = 'math-inline';
const DISPLAY_CLASS = 'math-display';

// `$$ ... $$` as its own block (may span lines)
const BLOCK_RULE = /^ {0,3}\$\$[ \t]*\n?([\s\S]+?)\n?[ \t]*\$\$[ \t]*(?:\n|$)/;
// `$$ ... $$` inside a paragraph
const INLINE_DISPLAY_RULE = /^\$\$([\s\S]+?)\$\$/;
// `$ ... $`: no space just inside the delimiters and no digit right after the closing `$`, so prices like "$5 and $10" stay text
const INLINE_RULE = /^\$(?![\s$])((?:\\[\s\S]|[^$\\\n])+?)(?<![\s\\])\$(?!\d)/;

export const mathExtension: MarkedExtension = {
    extensions: [
        {
            name: 'mathBlock',
            level: 'block',
            start: (src: string) => src.match(/^ {0,3}\$\$/m)?.index,
            tokenizer(src: string) {
                const match = BLOCK_RULE.exec(src);
                return match ? {type: 'mathBlock', raw: match[0], text: match[1].trim(), displayMode: true} : undefined;
            },
            renderer: token => `<div class="${DISPLAY_CLASS}">${escapeHtml(token['text'])}</div>\n`,
        },
        {
            name: 'mathInline',
            level: 'inline',
            start: (src: string) => src.indexOf('$') >= 0 ? src.indexOf('$') : undefined,
            tokenizer(src: string) {
                const display = INLINE_DISPLAY_RULE.exec(src);
                if (display) {
                    return {type: 'mathInline', raw: display[0], text: display[1].trim(), displayMode: true};
                }
                const match = INLINE_RULE.exec(src);
                return match ? {type: 'mathInline', raw: match[0], text: match[1], displayMode: false} : undefined;
            },
            renderer: token => `<span class="${token['displayMode'] ? DISPLAY_CLASS : INLINE_CLASS}">${escapeHtml(token['text'])}</span>`,
        },
    ],
};

export const markedWithMath = new Marked(mathExtension);

// Replaces the math placeholders under `root` with KaTeX output. Invalid TeX is shown as the raw source.
export function renderMath(root: HTMLElement) {
    root.querySelectorAll<HTMLElement>(`.${INLINE_CLASS}, .${DISPLAY_CLASS}`).forEach(el => {
        const tex = el.textContent ?? '';
        katex.render(tex, el, {
            displayMode: el.classList.contains(DISPLAY_CLASS),
            throwOnError: false,
            output: 'htmlAndMathml',
        });
        el.classList.add('math-rendered');
    });
}
