import {seriesIndexOf} from './app/theme/theme-presets';

function seriesToken(name: string): string {
    const index = seriesIndexOf(name);
    return index < 0 ? 'fallback' : String(index);
}

export function colorByFolderName(name: string) {
    return `var(--flick-series-${seriesToken(name)})`;
}

/** Text colour that reads on the group's own colour. */
export function contrastByFolderName(name: string) {
    return `var(--flick-series-${seriesToken(name)}-contrast)`;
}

const HTML_ESCAPES: Record<string, string> = {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'};

// Turns a search snippet (raw Markdown with matches wrapped in `<mark>`) into safe HTML that keeps only the highlights.
export function snippetToHtml(snippet: string): string {
    return snippet
        .replace(/[&<>"']/g, c => HTML_ESCAPES[c])
        .replace(/&lt;(\/?)mark&gt;/g, '<$1mark>')
        // Drop the Markdown syntax that would otherwise clutter a one-paragraph preview
        .replace(/^\s*#{1,6}\s+/gm, '')
        .replace(/^\s*(?:[-*+]|\d+\.)\s+/gm, '')
        .replace(/\*\*|__|`/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}
