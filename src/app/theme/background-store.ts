export const BACKGROUND_DB_NAME = 'flick-theme';
export const BACKGROUND_STORE_NAME = 'backgrounds';
export const BACKGROUND_MAX_DIMENSION = 1920;
export const BACKGROUND_IMAGE_QUALITY = 0.82;
export const BACKGROUND_IMAGE_TYPES = ['image/webp', 'image/jpeg'];

function openDatabase(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(BACKGROUND_DB_NAME, 1);
        request.onupgradeneeded = () => {
            if (!request.result.objectStoreNames.contains(BACKGROUND_STORE_NAME)) {
                request.result.createObjectStore(BACKGROUND_STORE_NAME);
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

function transact<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    return openDatabase().then(db => new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(BACKGROUND_STORE_NAME, mode);
        const request = run(transaction.objectStore(BACKGROUND_STORE_NAME));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        transaction.oncomplete = () => db.close();
    }));
}

/**
 * Background images stay on the device that uploaded them. Only the small display settings
 * travel between devices, so nothing large is ever written to the server.
 */
export class BackgroundImageStore {
    save(id: string, image: Blob): Promise<void> {
        return transact('readwrite', store => store.put(image, id)).then(() => undefined);
    }

    load(id: string): Promise<Blob | null> {
        return transact<Blob | undefined>('readonly', store => store.get(id))
            .then(value => value ?? null)
            .catch(() => null);
    }

    remove(id: string): Promise<void> {
        return transact('readwrite', store => store.delete(id)).then(() => undefined).catch(() => undefined);
    }

    keys(): Promise<string[]> {
        return transact<IDBValidKey[]>('readonly', store => store.getAllKeys())
            .then(keys => keys.map(String))
            .catch(() => []);
    }

    /** Drop every stored image except the one still in use. */
    async prune(keepId: string | null): Promise<void> {
        for (const key of await this.keys()) {
            if (key !== keepId) {
                await this.remove(key);
            }
        }
    }
}

function pickImageType(): string {
    const canvas = document.createElement('canvas');
    return BACKGROUND_IMAGE_TYPES.find(type => canvas.toDataURL(type).startsWith(`data:${type}`))
        ?? BACKGROUND_IMAGE_TYPES[BACKGROUND_IMAGE_TYPES.length - 1];
}

function drawScaled(source: CanvasImageSource, width: number, height: number): HTMLCanvasElement {
    const scale = Math.min(1, BACKGROUND_MAX_DIMENSION / Math.max(width, height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext('2d');
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
    return canvas;
}

function loadImageElement(file: File): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const image = new Image();
        image.onload = () => {
            URL.revokeObjectURL(url);
            resolve(image);
        };
        image.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error('The image could not be read.'));
        };
        image.src = url;
    });
}

/** Downscale and re-encode an uploaded picture so a large photo cannot fill up storage. */
export async function prepareBackgroundImage(file: File): Promise<Blob> {
    let canvas: HTMLCanvasElement;
    if ('createImageBitmap' in window) {
        const bitmap = await createImageBitmap(file);
        canvas = drawScaled(bitmap, bitmap.width, bitmap.height);
        bitmap.close();
    } else {
        const image = await loadImageElement(file);
        canvas = drawScaled(image, image.naturalWidth, image.naturalHeight);
    }
    const type = pickImageType();
    return new Promise((resolve, reject) => {
        canvas.toBlob(
            blob => blob ? resolve(blob) : reject(new Error('The image could not be processed.')),
            type,
            BACKGROUND_IMAGE_QUALITY,
        );
    });
}
