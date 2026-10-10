import {isStudyTab, StudyTab} from './tabs';

/*
 * What a reader does with the summary and quiz stays on the device: ticks, quiz answers in
 * progress, whether the card is folded away, which tab is open and whether captions are on.
 * Storage may be unavailable (private browsing), in which case everything still works for the visit.
 */

const TICKS_PREFIX = 'flickSummaryTicks:';
/** Lectures whose ticks changed here and have not reached FlickMan yet. */
const UNSYNCED_TICKS_KEY = 'flickSummaryTicksUnsynced';
const ANSWERS_PREFIX = 'flickQuizAnswers:';
const COLLAPSED_KEY = 'flickStudyAidsCollapsed';
const TAB_KEY = 'flickStudyAidsTab';
const CREDIT_KEY = 'flickStudyAidsCredit';
const CAPTIONS_KEY = 'flickCaptions';

function read(key: string): unknown {
    try {
        const raw = localStorage.getItem(key);

        return raw === null ? null : JSON.parse(raw);
    } catch {
        return null;
    }
}

function write(key: string, value: unknown): void {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch {
        // Kept for this visit only.
    }
}

export function readTicks(videoId: number): Set<string> {
    const stored = read(TICKS_PREFIX + videoId);

    return new Set(Array.isArray(stored) ? stored.filter((key): key is string => typeof key === 'string') : []);
}

export function writeTicks(videoId: number, ticks: ReadonlySet<string>): void {
    write(TICKS_PREFIX + videoId, [...ticks]);
}

export function ticksUnsynced(videoId: number): boolean {
    const stored = read(UNSYNCED_TICKS_KEY);

    return Array.isArray(stored) && stored.includes(videoId);
}

export function markTicksUnsynced(videoId: number, unsynced: boolean): void {
    const stored = read(UNSYNCED_TICKS_KEY);
    const others = (Array.isArray(stored) ? stored : []).filter(id => typeof id === 'number' && id !== videoId);
    write(UNSYNCED_TICKS_KEY, unsynced ? [...others, videoId] : others);
}

/** Null when this device has never started the quiz, as opposed to having cleared it. */
export function readAnswers(videoId: number): Record<string, number> | null {
    const stored = read(ANSWERS_PREFIX + videoId);
    if (typeof stored !== 'object' || stored === null || Array.isArray(stored)) {
        return null;
    }
    const answers: Record<string, number> = {};
    for (const [id, choice] of Object.entries(stored)) {
        if (Number.isInteger(choice) && (choice as number) >= 0) {
            answers[id] = choice as number;
        }
    }

    return answers;
}

export function writeAnswers(videoId: number, answers: Record<string, number>): void {
    write(ANSWERS_PREFIX + videoId, answers);
}

export function readCollapsed(): boolean {
    return read(COLLAPSED_KEY) === true;
}

export function writeCollapsed(collapsed: boolean): void {
    write(COLLAPSED_KEY, collapsed);
}

export function readTab(): StudyTab {
    const stored = read(TAB_KEY);

    return isStudyTab(stored) ? stored : 'summary';
}

export function writeTab(tab: StudyTab): void {
    write(TAB_KEY, tab);
}

/** The co-author box starts as the editor last left it. */
export function readCredit(): boolean {
    return read(CREDIT_KEY) === true;
}

export function writeCredit(credit: boolean): void {
    write(CREDIT_KEY, credit);
}

export function readCaptions(): boolean {
    return read(CAPTIONS_KEY) === true;
}

export function writeCaptions(on: boolean): void {
    write(CAPTIONS_KEY, on);
}
