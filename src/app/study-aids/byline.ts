import {CreditChoice, PartMeta} from './study-aids.model';

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

/** The co-author box as sent with a save: no name means FlickMan uses the account's name. */
export function creditFields(choice: CreditChoice): {credit: boolean; credit_name: string | null} {
    return {credit: choice.credit, credit_name: choice.credit ? choice.name.trim() || null : null};
}
