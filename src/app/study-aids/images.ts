/*
 * Pictures in summaries and questions live in the editors' own Google Drive. Flick keeps only the
 * link, always as https://drive.google.com/file/d/{id}/view, and draws the picture straight from
 * Google when a reader gets to it, so FlickMan neither stores nor serves any images. An image from
 * anywhere else is shown as a link, so a pasted picture cannot tell another site who is reading.
 */

const DRIVE_ID = '[A-Za-z0-9_-]{20,100}';

/** The ways Drive writes a link to a file: file/d/{id}/…, open?id=, uc?id=, thumbnail?id= and its image host. */
const DRIVE_LINKS = [
    new RegExp(`^https://(?:drive|docs)\\.google\\.com/file/(?:u/\\d+/)?d/(${DRIVE_ID})(?:[/?#]|$)`),
    new RegExp(`^https://(?:drive|docs)\\.google\\.com/(?:open|uc|thumbnail)\\?(?:[^#]*&)?id=(${DRIVE_ID})(?:[&#]|$)`),
    new RegExp(`^https://lh3\\.googleusercontent\\.com/d/(${DRIVE_ID})(?:[=/?#]|$)`),
];

/** The one form saved in the Markdown, the only one FlickMan accepts. */
const SAVED_LINK = new RegExp(`^https://drive\\.google\\.com/file/d/(${DRIVE_ID})/view$`);

/** Wide enough for the reading window; Google sends a smaller picture when the file is smaller. */
const DRAWN_WIDTH = 1600;

/** The class of the link that stands for a Drive picture until the page draws it (see RichTextComponent). */
export const DRIVE_IMAGE_CLASS = 'drive-image';

/** The Drive file a link points at, in any form Drive gives out, or null. */
export function driveFileId(link: string): string | null {
    const trimmed = link.trim();
    for (const pattern of DRIVE_LINKS) {
        const match = pattern.exec(trimmed);
        if (match) {
            return match[1];
        }
    }

    return null;
}

export function driveLink(id: string): string {
    return `https://drive.google.com/file/d/${id}/view`;
}

/** The Drive file of a saved image link, or null for any other address. */
export function savedDriveId(src: string): string | null {
    return SAVED_LINK.exec(src.trim())?.[1] ?? null;
}

/** Where a Drive picture is drawn from. */
export function driveImageUrl(id: string, width = DRAWN_WIDTH): string {
    return `https://drive.google.com/thumbnail?id=${id}&sz=w${width}`;
}

/** Markdown for a picture, described by what the editor wrote, else by the word "image". */
export function imageMarkdown(id: string, description: string): string {
    return `![${description.replace(/[[\]\\]/g, '').trim() || 'image'}](${driveLink(id)})`;
}

const MARKDOWN_IMAGE = /(!\[[^\]]*]\(\s*)(<?)([^)\s>]+)(>?)/g;

/** The same Markdown with every Drive picture written in the saved form, whichever link was pasted. */
export function normalizeImageLinks(markdown: string): string {
    return markdown.replace(MARKDOWN_IMAGE, (whole, start: string, open: string, url: string, close: string) => {
        const id = driveFileId(url);

        return id ? start + driveLink(id) : start + open + url + close;
    });
}

/**
 * Whether readers will be able to see the picture: it loads only when the file is shared as
 * "Anyone with the link". Gives up after `timeout` milliseconds.
 */
export function canShowDriveImage(id: string, timeout = 15_000): Promise<boolean> {
    return new Promise(resolve => {
        const image = new Image();
        const timer = setTimeout(() => finish(false), timeout);
        const finish = (shown: boolean) => {
            clearTimeout(timer);
            image.onload = image.onerror = null;
            resolve(shown);
        };
        image.referrerPolicy = 'no-referrer';
        image.onload = () => finish(image.naturalWidth > 0);
        image.onerror = () => finish(false);
        image.src = driveImageUrl(id, 200);
    });
}

/**
 * Turns the links that stand for Drive pictures into the pictures, each loaded only when it comes
 * into view. A file that is not shared with everyone stays a link to it.
 */
export function drawDriveImages(root: HTMLElement): void {
    root.querySelectorAll<HTMLAnchorElement>(`a.${DRIVE_IMAGE_CLASS}:not(.drawn)`).forEach(link => {
        const id = savedDriveId(link.getAttribute('href') ?? '');
        if (!id) {
            return;
        }
        const description = link.textContent ?? '';
        const image = root.ownerDocument.createElement('img');
        image.loading = 'lazy';
        image.decoding = 'async';
        image.referrerPolicy = 'no-referrer';
        image.alt = description;
        image.addEventListener('error', () => {
            link.textContent = `${description || 'Image'} (open in Google Drive)`;
            link.classList.add('unavailable');
        }, {once: true});
        image.src = driveImageUrl(id);
        link.classList.add('drawn');
        link.title = 'Open in Google Drive';
        link.replaceChildren(image);
    });
}
