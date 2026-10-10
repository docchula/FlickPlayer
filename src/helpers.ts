export function colorByFolderName(name: string) {
    const colorMap = {
        '1st year': '#00BCD4',
        '2nd year': '#FF9800',
        '3rd year': '#795548',
        '4th year': '#9C27B0',
        '5th year': '#4CAF50',
        '6th year': '#E91E63',
        'NLE1': '#607D8B',
        'NLE2': '#FDD835'
    };
    return colorMap[name] || 'gray';
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
