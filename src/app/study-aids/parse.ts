import {AnswerStats, GenerationState, QuizPart, QuizQuestion, StudyAids, SummaryPart, TranscriptParagraph} from './study-aids.model';

/*
 * FlickMan's answers are checked field by field rather than trusted, so a malformed question is
 * dropped instead of breaking the whole card.
 */

const GENERATION_STATES: GenerationState[] = ['none', 'pending', 'ready', 'failed'];

type Fields = Record<string, unknown>;

export function isObject(value: unknown): value is Fields {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function text(value: unknown): string | null {
    return typeof value === 'string' ? value : null;
}

function count(value: unknown): number | null {
    return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;
}

/** GraphQL sends IDs as strings: "7". */
function numericId(value: unknown): number | null {
    return count(typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value);
}

function seconds(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : null;
}

export function parseStats(value: unknown): AnswerStats | null {
    if (!isObject(value)) {
        return null;
    }
    const answered = count(value['answered']);
    const correct = count(value['correct']);

    return answered !== null && correct !== null && correct <= answered ? {answered, correct} : null;
}

function parseQuestion(value: unknown): QuizQuestion | null {
    if (!isObject(value)) {
        return null;
    }
    const id = text(value['id']);
    const prompt = text(value['prompt']);
    const choices = Array.isArray(value['choices']) && value['choices'].every(choice => typeof choice === 'string')
        ? value['choices'] as string[]
        : null;
    const answer = count(value['answer']);
    if (!id || prompt === null || !choices || choices.length < 2 || answer === null || answer >= choices.length) {
        return null;
    }
    const mine = count(value['mine']);

    return {
        id,
        prompt,
        choices,
        answer,
        explanation: text(value['explanation']) || null,
        time: seconds(value['time']),
        stats: parseStats(value['stats']),
        mine: mine !== null && mine < choices.length ? mine : null,
    };
}

export function parseSummary(value: unknown): SummaryPart | null {
    const markdown = isObject(value) ? text(value['markdown']) : null;

    return markdown === null ? null : {markdown};
}

export function parseQuiz(value: unknown): QuizPart | null {
    if (!isObject(value) || !Array.isArray(value['questions'])) {
        return null;
    }

    return {questions: value['questions'].map(parseQuestion).filter((question): question is QuizQuestion => question !== null)};
}

export function parseStudyAids(value: unknown): StudyAids | null {
    if (!isObject(value)) {
        return null;
    }
    const videoId = numericId(value['video_id']);
    if (videoId === null) {
        return null;
    }

    return {
        video_id: videoId,
        generation: GENERATION_STATES.find(state => state === value['generation']) ?? 'none',
        has_transcript: value['has_transcript'] === true,
        my_ticks: Array.isArray(value['my_ticks']) ? value['my_ticks'].filter((key): key is string => typeof key === 'string') : null,
        summary: parseSummary(value['summary']),
        quiz: parseQuiz(value['quiz']),
    };
}

export function parseTranscript(value: unknown): TranscriptParagraph[] | null {
    if (!isObject(value) || !Array.isArray(value['paragraphs'])) {
        return null;
    }

    // Kept in the order spoken: a stamp can be earlier than the one before where two recorded pieces overlap.
    return value['paragraphs']
        .map(paragraph => isObject(paragraph) ? {time: seconds(paragraph['time']), text: text(paragraph['text'])?.trim() ?? ''} : null)
        .filter((paragraph): paragraph is TranscriptParagraph => !!paragraph && paragraph.time !== null && !!paragraph.text);
}
