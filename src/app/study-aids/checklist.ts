import {Marked, MarkedExtension} from 'marked';
import {mathExtension} from '../home/course/markdown-math';
import {isAllowedImage} from './images';

/*
 * A summary is Markdown written to these conventions (FlickMan's AI follows them too):
 *
 *   # Title
 *   ## Section heading [HH:MM:SS]   the time is optional, where the lecture starts the topic
 *   ### Label                       a small heading inside a section
 *   1. Term : fact                  every top-level list item is one numbered point
 *      1. detail                    nested items are sub-points
 *   **key term**, ==exam point==, tables and $maths$
 *
 * Points are numbered here, continuously through the whole summary, so the numbers written in
 * the Markdown never matter and an editor can add a point anywhere without renumbering.
 */

export interface ChecklistBlock {
    kind: 'point' | 'label' | 'html';
    /** Ticks are stored under a point's key, which only changes when that point's text does. */
    key: string;
    /** The point's number; null for other blocks. */
    number: number | null;
    html: string;
}

export interface ChecklistSection {
    headingHtml: string | null;
    /** The heading as plain text, for the outline in the reading window. */
    headingText: string | null;
    /** Seconds into the lecture where this section starts. */
    time: number | null;
    blocks: ChecklistBlock[];
}

export interface Checklist {
    title: string | null;
    sections: ChecklistSection[];
    pointKeys: string[];
}

const HIGHLIGHT_RULE = /^==(?=\S)([\s\S]*?\S)==/;

/** `==text==` becomes `<mark>`, for the points worth remembering for the exam. */
export const highlightExtension: MarkedExtension = {
    extensions: [
        {
            name: 'highlight',
            level: 'inline',
            start: (src: string) => {
                const index = src.indexOf('==');

                return index >= 0 ? index : undefined;
            },
            tokenizer(src: string) {
                const match = HIGHLIGHT_RULE.exec(src);

                return match
                    ? {type: 'highlight', raw: match[0], text: match[1], tokens: this.lexer.inlineTokens(match[1])}
                    : undefined;
            },
            renderer(token) {
                return `<mark>${this.parser.parseInline(token.tokens ?? [])}</mark>`;
            },
        },
    ],
};

export const studyMarked = new Marked(mathExtension, highlightExtension);

/** Markdown for a block of text, such as a question or an explanation. */
export function renderBlock(markdown: string): string {
    return finishHtml(studyMarked.parse(markdown, {async: false}));
}

/** Markdown for text that sits inside a line, such as a choice. */
export function renderInline(markdown: string): string {
    return finishHtml(studyMarked.parseInline(markdown, {async: false}));
}

/** The words of some Markdown without its formatting, for a one-line preview. */
export function plainText(markdown: string): string {
    const text = new DOMParser().parseFromString(renderInline(markdown), 'text/html').body.textContent ?? '';

    return text.replace(/\s+/g, ' ').trim();
}

const TIMESTAMP = /^(?:(\d{1,2}):)?(\d{1,2}):(\d{2})$/;
const HEADING_TIME = /\s*\[((?:\d{1,2}:)?\d{1,2}:\d{2})\]\s*$/;

/** Reads `m:ss`, `mm:ss` or `h:mm:ss` into seconds. */
export function parseTimestamp(value: string): number | null {
    const match = TIMESTAMP.exec(value.trim());
    if (!match) {
        return null;
    }
    const hours = Number(match[1] ?? 0);
    const minutes = Number(match[2]);
    const seconds = Number(match[3]);
    if (seconds >= 60 || (match[1] !== undefined && minutes >= 60)) {
        return null;
    }

    return hours * 3600 + minutes * 60 + seconds;
}

/** `7:45` or `1:02:03`, for reading. */
export function formatClock(totalSeconds: number): string {
    const total = Math.max(0, Math.floor(totalSeconds));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor(total % 3600 / 60);
    const seconds = String(total % 60).padStart(2, '0');

    return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}` : `${minutes}:${seconds}`;
}

/** `00:07:45`, the form written into summaries. */
export function formatStamp(totalSeconds: number): string {
    const total = Math.max(0, Math.floor(totalSeconds));

    return [Math.floor(total / 3600), Math.floor(total % 3600 / 60), total % 60]
        .map(part => String(part).padStart(2, '0'))
        .join(':');
}

/** FNV-1a, enough to tell a point's text from another's. */
function hash(value: string): string {
    let result = 0x811c9dc5;
    for (let i = 0; i < value.length; i++) {
        result ^= value.charCodeAt(i);
        result = Math.imul(result, 0x01000193);
    }

    return (result >>> 0).toString(36);
}

function openInNewTab(link: Element): void {
    link.setAttribute('target', '_blank');
    link.setAttribute('rel', 'noopener noreferrer');
}

/**
 * Links open in a new tab, so following one never takes the reader away from the lecture. Images
 * FlickMan did not store are shown as links instead: loading one would tell a third party who is
 * reading.
 */
function finishHtml(html: string): string {
    const body = new DOMParser().parseFromString(html, 'text/html').body;
    body.querySelectorAll('a[href]').forEach(openInNewTab);
    for (const image of Array.from(body.querySelectorAll('img'))) {
        const src = image.getAttribute('src') ?? '';
        if (isAllowedImage(src)) {
            continue;
        }
        if (!src) {
            image.remove();
            continue;
        }
        const link = body.ownerDocument.createElement('a');
        link.setAttribute('href', src);
        link.textContent = image.getAttribute('alt') || 'Image';
        openInNewTab(link);
        image.replaceWith(link);
    }

    return body.innerHTML;
}

/** Removes the trailing `[HH:MM:SS]` from a heading and returns it in seconds. */
function takeHeadingTime(heading: Element): number | null {
    const match = HEADING_TIME.exec(heading.textContent ?? '');
    const time = match ? parseTimestamp(match[1]) : null;
    if (time === null) {
        return null;
    }
    const walker = heading.ownerDocument.createTreeWalker(heading, NodeFilter.SHOW_TEXT);
    let last: Text | null = null;
    while (walker.nextNode()) {
        last = walker.currentNode as Text;
    }
    if (!last || !HEADING_TIME.test(last.data)) {
        return null;
    }
    last.data = last.data.replace(HEADING_TIME, '');

    return time;
}

export function buildChecklist(markdown: string): Checklist {
    const html = renderBlock(markdown);
    const body = new DOMParser().parseFromString(html, 'text/html').body;
    const checklist: Checklist = {title: null, sections: [], pointKeys: []};
    const occurrences = new Map<string, number>();
    let section: ChecklistSection | null = null;
    let blockCount = 0;

    const currentSection = (): ChecklistSection => {
        if (!section) {
            section = {headingHtml: null, headingText: null, time: null, blocks: []};
            checklist.sections.push(section);
        }

        return section;
    };
    const addBlock = (kind: ChecklistBlock['kind'], content: string) => {
        currentSection().blocks.push({kind, key: 'block-' + blockCount++, number: null, html: content});
    };

    for (const element of Array.from(body.children)) {
        const tag = element.tagName;
        if (tag === 'H1' && checklist.title === null && checklist.sections.length === 0) {
            checklist.title = element.textContent?.trim() || null;
        } else if (tag === 'H1' || tag === 'H2') {
            const time = takeHeadingTime(element);
            section = {headingHtml: element.innerHTML.trim(), headingText: element.textContent?.trim() || null, time, blocks: []};
            checklist.sections.push(section);
        } else if (/^H[3-6]$/.test(tag)) {
            addBlock('label', element.innerHTML.trim());
        } else if (tag === 'OL' || tag === 'UL') {
            for (const item of Array.from(element.children).filter(child => child.tagName === 'LI')) {
                const content = (item.textContent ?? '').replace(/\s+/g, ' ').trim();
                const seen = (occurrences.get(content) ?? 0) + 1;
                occurrences.set(content, seen);
                const key = hash(content) + (seen > 1 ? '-' + seen : '');
                checklist.pointKeys.push(key);
                currentSection().blocks.push({kind: 'point', key, number: checklist.pointKeys.length, html: item.innerHTML.trim()});
            }
        } else if (tag === 'TABLE') {
            addBlock('html', `<div class="table-scroll">${element.outerHTML}</div>`);
        } else {
            addBlock('html', element.outerHTML);
        }
    }

    return checklist;
}

const recent = new Map<string, Checklist>();

/** buildChecklist, remembered for the last few summaries, since the card and the reading window both show one. */
export function checklistFor(markdown: string): Checklist {
    let checklist = recent.get(markdown);
    if (!checklist) {
        checklist = buildChecklist(markdown);
        if (recent.size >= 4) {
            recent.delete(recent.keys().next().value as string);
        }
        recent.set(markdown, checklist);
    }

    return checklist;
}
