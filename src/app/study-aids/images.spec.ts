import {drawDriveImages, driveFileId, imageMarkdown, normalizeImageLinks, savedDriveId} from './images';

const ID = '1AbCdEfGhIjKlMnOpQrStUvWxYz012345';
const SAVED = `https://drive.google.com/file/d/${ID}/view`;

describe('images', () => {
    it('reads the file from any link Google Drive gives out', () => {
        for (const link of [
            `https://drive.google.com/file/d/${ID}/view?usp=sharing`,
            `https://drive.google.com/file/d/${ID}/view?usp=drive_link`,
            `https://drive.google.com/file/u/1/d/${ID}/edit`,
            `https://drive.google.com/file/d/${ID}`,
            `https://drive.google.com/open?id=${ID}`,
            `https://drive.google.com/uc?export=view&id=${ID}`,
            `https://drive.google.com/thumbnail?id=${ID}&sz=w1000`,
            `https://lh3.googleusercontent.com/d/${ID}=w800`,
            `  ${SAVED}  `,
        ]) {
            expect(driveFileId(link)).withContext(link).toBe(ID);
        }
    });

    it('refuses links that only look like Drive', () => {
        for (const link of [
            `http://drive.google.com/file/d/${ID}/view`,
            `https://drive.google.com.example.com/file/d/${ID}/view`,
            `https://example.com/?u=https://drive.google.com/file/d/${ID}/view`,
            'https://drive.google.com/file/d/short/view',
            'https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOpQrStUvWxYz012345',
        ]) {
            expect(driveFileId(link)).withContext(link).toBeNull();
        }
    });

    it('only draws the saved form, the one FlickMan accepts', () => {
        expect(savedDriveId(SAVED)).toBe(ID);
        expect(savedDriveId(SAVED + '?usp=sharing')).toBeNull();
        expect(savedDriveId(`https://drive.google.com/open?id=${ID}`)).toBeNull();
    });

    it('writes pasted Drive links in the saved form', () => {
        expect(normalizeImageLinks(`Before ![ER](https://drive.google.com/open?id=${ID}) after [notes](https://example.com)`))
            .toBe(`Before ![ER](${SAVED}) after [notes](https://example.com)`);
        expect(normalizeImageLinks('![pixel](https://tracker.example/p.gif)')).toBe('![pixel](https://tracker.example/p.gif)');
    });

    it('describes a picture with what the editor wrote', () => {
        expect(imageMarkdown(ID, ' Cell [1] ')).toBe(`![Cell 1](${SAVED})`);
        expect(imageMarkdown(ID, '')).toBe(`![image](${SAVED})`);
    });

    it('draws a Drive picture lazily, from Google, inside its link', () => {
        const root = document.createElement('div');
        root.innerHTML = `<a href="${SAVED}" class="drive-image">ER</a>`;
        drawDriveImages(root);
        const image = root.querySelector('img') as HTMLImageElement;

        expect(image.loading).toBe('lazy');
        expect(image.alt).toBe('ER');
        expect(image.src).toBe(`https://drive.google.com/thumbnail?id=${ID}&sz=w1600`);
        expect(root.querySelector('a')?.getAttribute('href')).toBe(SAVED);

        image.dispatchEvent(new Event('error'));
        expect(root.querySelector('img')).toBeNull();
        expect(root.textContent).toBe('ER (open in Google Drive)');
    });
});
