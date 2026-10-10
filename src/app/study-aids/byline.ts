import {PartMeta} from './study-aids.model';

/** `8 Nov 2026`, as FlickMan writes dates in its messages. */
export function formatDay(iso: string): string {
    return new Date(iso).toLocaleDateString('en-GB', {day: 'numeric', month: 'short', year: 'numeric'});
}

/** "Kan", "Kan and Chain", "Kan, Chain and Pim". */
export function joinNames(names: string[]): string {
    return names.length < 2 ? names.join('') : names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
}

export function isAiDraft(part: PartMeta): boolean {
    return part.origin === 'ai' && !part.edited;
}

/** Who made a summary or quiz, as shown under the card's title. */
export function byline(part: PartMeta): string {
    const names = joinNames(part.contributors.map(contributor => contributor.name));
    if (part.origin === 'editor') {
        return names ? 'By ' + names : 'Written by an editor';
    }
    if (!part.edited) {
        return 'AI draft from the lecture recording. Check it against the lecture.';
    }

    return names ? 'AI draft, edited by ' + names : 'AI draft, edited by an editor';
}

/** Whether editors checked the version on show, an older one, or none. */
export function verifiedState(part: PartMeta): 'current' | 'earlier' | null {
    if (!part.verified) {
        return null;
    }

    return part.verified.revision >= part.revision ? 'current' : 'earlier';
}

/** "Verified by Kan and Chain", as students read it. */
export function verifiedLine(part: PartMeta): string | null {
    const names = joinNames(part.verified?.by.map(verifier => verifier.name) ?? []);
    switch (verifiedState(part)) {
        case 'current':
            return 'Verified by ' + names;
        case 'earlier':
            return `Verified by ${names} before the latest changes`;
        default:
            return part.origin === 'ai' ? 'Not verified by an editor yet' : null;
    }
}
