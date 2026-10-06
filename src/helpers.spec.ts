import {colorByFolderName, contrastByFolderName} from './helpers';

// The colours themselves come from the theme; see palette.spec.ts for the values each mode gives.
describe('colorByFolderName', () => {
    it('returns the theme colour for a known folder name', () => {
        expect(colorByFolderName('1st year')).toBe('var(--flick-series-0)');
        expect(colorByFolderName('NLE2')).toBe('var(--flick-series-7)');
    });

    it('falls back to the theme fallback colour for an unknown folder name', () => {
        expect(colorByFolderName('Unknown Folder')).toBe('var(--flick-series-fallback)');
    });

    it('falls back to the theme fallback colour for an empty string', () => {
        expect(colorByFolderName('')).toBe('var(--flick-series-fallback)');
    });

    it('pairs each colour with a text colour that reads on it', () => {
        expect(contrastByFolderName('1st year')).toBe('var(--flick-series-0-contrast)');
    });
});
