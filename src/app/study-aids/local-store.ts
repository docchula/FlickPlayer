import {CreditChoice} from './study-aids.model';

/*
 * What a reader does with the summary and quiz stays on the device: ticks, quiz answers in
 * progress and which cards are folded away. Storage may be unavailable (private browsing), in
 * which case everything still works for the visit.
 */

const TICKS_PREFIX = 'flickSummaryTicks:';
const ANSWERS_PREFIX = 'flickQuizAnswers:';
const COLLAPSED_KEY = 'flickStudyAidsCollapsed';
const CREDIT_KEY = 'flickStudyAidsCredit';

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

export function readCollapsed(card: 'summary' | 'quiz'): boolean {
    const stored = read(COLLAPSED_KEY);

    return typeof stored === 'object' && stored !== null && (stored as Record<string, unknown>)[card] === true;
}

export function writeCollapsed(card: 'summary' | 'quiz', collapsed: boolean): void {
    const stored = read(COLLAPSED_KEY);
    write(COLLAPSED_KEY, {...(typeof stored === 'object' && stored !== null ? stored : {}), [card]: collapsed});
}

/** The co-author box starts as the editor last left it. */
export function readCreditChoice(): CreditChoice {
    const stored = read(CREDIT_KEY);
    if (typeof stored !== 'object' || stored === null) {
        return {credit: false, name: ''};
    }
    const fields = stored as Record<string, unknown>;

    return {credit: fields['credit'] === true, name: typeof fields['name'] === 'string' ? fields['name'] : ''};
}

export function writeCreditChoice(choice: CreditChoice): void {
    write(CREDIT_KEY, choice);
}
