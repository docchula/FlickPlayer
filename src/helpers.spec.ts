import {colorByFolderName} from './helpers';

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
