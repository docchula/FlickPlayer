import {imageMarkdown, imageProblem, isAllowedImage, prepareImage, uploadName} from './images';

function canvasImage(width: number, height: number, type: string): Promise<File> {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d')?.fillRect(0, 0, width, height);

    return new Promise(resolve => canvas.toBlob(blob => resolve(new File([blob as Blob], 'Cell diagram.png', {type})), type));
}

describe('images', () => {
    it('allows FlickMan images and local previews only', () => {
        expect(isAllowedImage('https://flick-man-cdn.docchula.com/v1/study_aids/images/01M4D7B2STKMV08W6Z0ZF3G56N.png')).toBeTrue();
        expect(isAllowedImage('data:image/png;base64,AAAA')).toBeTrue();
        expect(isAllowedImage('blob:http://localhost:4200/1234')).toBeTrue();
        expect(isAllowedImage('https://example.com/v1/study_aids/images/x.png')).toBeFalse();
        expect(isAllowedImage('https://docchula.com.example.com/v1/study_aids/images/x.png')).toBeFalse();
        expect(isAllowedImage('http://flick-man-app.docchula.com/v1/study_aids/images/x.png')).toBeFalse();
        expect(isAllowedImage('https://flick-man-app.docchula.com/v1/video')).toBeFalse();
    });

    it('accepts the image types FlickMan stores', () => {
        expect(imageProblem(new File(['x'], 'a.png', {type: 'image/png'}))).toBeNull();
        expect(imageProblem(new File(['x'], 'a.heic', {type: 'image/heic'}))).toBe('Choose a PNG, JPEG, WebP or GIF image.');
    });

    it('sends a small image as it is', async () => {
        const file = await canvasImage(40, 30, 'image/png');

        expect(await prepareImage(file)).toBe(file);
    });

    it('draws an image wider than 2000 px smaller', async () => {
        const file = await canvasImage(2400, 600, 'image/png');
        const prepared = await prepareImage(file);
        const bitmap = await createImageBitmap(prepared as Blob);

        expect(bitmap.width).toBe(2000);
        expect(bitmap.height).toBe(500);
        bitmap.close();
    });

    it('names the upload after what was prepared', () => {
        expect(uploadName(new File(['x'], 'Cell diagram.png'), new Blob(['x'], {type: 'image/webp'}))).toBe('Cell diagram.webp');
    });

    it('writes the Markdown with the file name as its description', () => {
        expect(imageMarkdown('https://flick-man-app.docchula.com/v1/study_aids/images/A.png', 'Cell [1].png'))
            .toBe('![Cell 1](https://flick-man-app.docchula.com/v1/study_aids/images/A.png)');
    });
});
