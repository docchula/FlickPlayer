import {colorByFolderName, snippetToHtml} from './helpers';

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
