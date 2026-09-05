import {FontOption} from './settings.model';

/** Drawn under every font name, so a face is judged on Thai as much as on Latin. */
export const FONT_SAMPLE = 'ตัวอย่างข้อความ Sample 123';

export const DEFAULT_FONT_ID = 'default';

const GOOGLE_CSS_URL = 'https://fonts.googleapis.com/css2';
/** The regular and semibold the app actually renders. */
const WEIGHTS = 'wght@400;600';

/**
 * The font picker, ordered from plainest to most decorative. A font without `google` is
 * already on the device and costs nothing; the rest are fetched only once chosen. Arial and
 * Times New Roman carry no Thai glyphs at all, hence the Thai-capable family at the end of
 * their stacks.
 */
export const FONT_OPTIONS: FontOption[] = [
    {id: DEFAULT_FONT_ID, name: 'Default', stack: ''},
    {id: 'sarabun', name: 'Sarabun', stack: 'Sarabun, sans-serif', google: 'Sarabun'},
    {id: 'prompt', name: 'Prompt', stack: 'Prompt, sans-serif', google: 'Prompt'},
    {id: 'kanit', name: 'Kanit', stack: 'Kanit, sans-serif', google: 'Kanit'},
    {id: 'taviraj', name: 'Taviraj', stack: 'Taviraj, serif', google: 'Taviraj'},
    {id: 'mali', name: 'Mali', stack: 'Mali, cursive', google: 'Mali'},
    {id: 'charm', name: 'Charm', stack: 'Charm, cursive', google: 'Charm'},
    {id: 'arial', name: 'Arial', stack: "Arial, Helvetica, 'Leelawadee UI', Tahoma, sans-serif"},
    {id: 'times', name: 'Times New Roman', stack: "'Times New Roman', Times, Norasi, serif"},
    {id: 'angsana', name: 'Angsana New', stack: "'Angsana New', AngsanaUPC, Norasi, serif", scale: 1.35},
    {id: 'thonburi', name: 'Thonburi', stack: 'Thonburi, Krungthep, sans-serif'},
];

export function findFont(id: string): FontOption {
    return FONT_OPTIONS.find(font => font.id === id) ?? FONT_OPTIONS[0];
}

/** The stylesheet for one family, at the weights the app renders. */
export function fontHref(font: FontOption): string {
    if (!font.google) {
        return '';
    }

    return GOOGLE_CSS_URL + '?family=' + encodeURIComponent(font.google) + ':' + WEIGHTS + '&display=swap';
}

/**
 * One request covering every downloadable face in the picker, cut down with Google's `text`
 * parameter to the handful of characters the picker actually draws. That turns opening the
 * sheet from hundreds of kilobytes into a few.
 */
export function previewHref(): string {
    const families: string[] = [];
    let characters = FONT_SAMPLE;
    for (const font of FONT_OPTIONS) {
        if (font.google) {
            families.push('family=' + encodeURIComponent(font.google));
        }
        characters += font.name;
    }
    const unique = Array.from(new Set(characters)).join('');

    return GOOGLE_CSS_URL + '?' + families.join('&') + '&text=' + encodeURIComponent(unique) + '&display=swap';
}
