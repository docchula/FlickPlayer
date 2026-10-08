import {LIMITS} from './study-aids.model';

export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

const EXTENSIONS: Record<string, string> = {'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif'};

/** Each try draws the image smaller and compresses it harder, until it fits FlickMan's limit. */
const SHRINK_STEPS = [
    {side: 2000, quality: 0.9},
    {side: 1600, quality: 0.85},
    {side: 1200, quality: 0.8},
];

/** FlickMan's own image addresses. Other images are never loaded, so they cannot track readers. */
const FLICKMAN_IMAGE = /^https:\/\/([a-z0-9-]+\.)*docchula\.com\/v1\/study_aids\/images\//i;
/** Images held in the page itself, such as previews, which load nothing from the network. */
const LOCAL_IMAGE = /^(data:image\/|blob:)/i;

export function isAllowedImage(url: string): boolean {
    return FLICKMAN_IMAGE.test(url) || LOCAL_IMAGE.test(url);
}

/** Why a picked file cannot be uploaded, or null when it can. */
export function imageProblem(file: File): string | null {
    if (!IMAGE_TYPES.includes(file.type)) {
        return 'Choose a PNG, JPEG, WebP or GIF image.';
    }

    // A GIF may be animated, which drawing it smaller would lose.
    return file.type === 'image/gif' && file.size > LIMITS.imageBytes ? 'This GIF is too large. Use one under 5 MB.' : null;
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
    return new Promise(resolve => canvas.toBlob(resolve, type, quality));
}

async function shrink(bitmap: ImageBitmap, side: number, quality: number, sourceType: string): Promise<Blob | null> {
    const scale = Math.min(1, side / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    // WebP keeps transparency and stays small; a browser that cannot write it hands back PNG instead.
    const webp = await toBlob(canvas, 'image/webp', quality);
    if (webp?.type === 'image/webp') {
        return webp;
    }

    return toBlob(canvas, sourceType === 'image/png' ? 'image/png' : 'image/jpeg', quality);
}

/**
 * The image to upload. A large photo is drawn smaller first, so readers do not download megabytes
 * for it; a GIF is sent as it is, since it may be animated. Null when nothing small enough results.
 */
export async function prepareImage(file: File): Promise<Blob | null> {
    if (file.type === 'image/gif') {
        return file.size <= LIMITS.imageBytes ? file : null;
    }
    const bitmap = await createImageBitmap(file);
    try {
        if (file.size <= LIMITS.imageShrinkBytes && Math.max(bitmap.width, bitmap.height) <= LIMITS.imageMaxSide) {
            return file;
        }
        for (const step of SHRINK_STEPS) {
            const image = await shrink(bitmap, step.side, step.quality, file.type);
            if (image && image.size <= LIMITS.imageShrinkBytes) {
                return image;
            }
        }

        return file.size <= LIMITS.imageBytes ? file : null;
    } finally {
        bitmap.close();
    }
}

/** The file name to upload under, with the extension of what prepareImage produced. */
export function uploadName(file: File, image: Blob): string {
    return (file.name.replace(/\.[^.]+$/, '') || 'image') + '.' + (EXTENSIONS[image.type] ?? 'img');
}

/** Markdown for an uploaded image, described by its file name until the editor writes better. */
export function imageMarkdown(url: string, fileName: string): string {
    const description = fileName.replace(/\.[^.]+$/, '').replace(/[[\]\\]/g, '').trim() || 'image';

    return `![${description}](${/[\s()]/.test(url) ? '<' + url + '>' : url})`;
}
