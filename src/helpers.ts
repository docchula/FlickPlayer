import {seriesIndexOf} from './app/theme/theme-presets';

function seriesToken(name: string): string {
    const index = seriesIndexOf(name);
    return index < 0 ? 'fallback' : String(index);
}

export function colorByFolderName(name: string) {
    return `var(--flick-series-${seriesToken(name)})`;
}

/** Text colour that reads on the group's own colour. */
export function contrastByFolderName(name: string) {
    return `var(--flick-series-${seriesToken(name)}-contrast)`;
}
