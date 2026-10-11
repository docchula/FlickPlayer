import {colorByFolderName, formatDuration, snippetToHtml} from './helpers';

describe('colorByFolderName', () => {
    it('returns the mapped color for a known folder name', () => {
        expect(colorByFolderName('1st year')).toBe('#00BCD4');
        expect(colorByFolderName('NLE2')).toBe('#FDD835');
    });

    it('falls back to gray for an unknown folder name', () => {
        expect(colorByFolderName('Unknown Folder')).toBe('gray');
    });

    it('falls back to gray for an empty string', () => {
        expect(colorByFolderName('')).toBe('gray');
    });
});

describe('snippetToHtml', () => {
    it('keeps <mark> highlights but escapes any other HTML', () => {
        expect(snippetToHtml('a <mark>heart</mark> <script>x</script> & "b"'))
            .toBe('a <mark>heart</mark> &lt;script&gt;x&lt;/script&gt; &amp; &quot;b&quot;');
    });

    it('strips Markdown headings, list markers and emphasis, and collapses whitespace', () => {
        expect(snippetToHtml('## Heading\n\n- **bold** item\n1. `code`  here'))
            .toBe('Heading bold item code here');
    });
});

describe('formatDuration', () => {
    it('is empty for zero', () => {
        expect(formatDuration(0)).toBe('');
    });

    it('uses minutes below an hour', () => {
        expect(formatDuration(45 * 60 + 10)).toBe('45 min');
    });

    it('uses hours and minutes from an hour up', () => {
        expect(formatDuration(125 * 60)).toBe('2h 5m');
        expect(formatDuration(180 * 60)).toBe('3h');
    });
});
