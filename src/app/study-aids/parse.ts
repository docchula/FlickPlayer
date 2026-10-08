import {
    AnswerStats,
    Contributor,
    GenerationState,
    PartMeta,
    QuizPart,
    QuizQuestion,
    StudyAids,
    StudyAidsEditor,
    SummaryPart,
    UploadedImage,
} from './study-aids.model';

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

function seconds(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : null;
}

function contributors(value: unknown): Contributor[] {
    if (!Array.isArray(value)) {
        return [];
    }

    return value
        .map(entry => isObject(entry) ? text(entry['name'])?.trim() : null)
        .filter((name): name is string => !!name)
        .map(name => ({name}));
}

function meta(fields: Fields): PartMeta {
    return {
        revision: count(fields['revision']) ?? 0,
        origin: fields['origin'] === 'editor' ? 'editor' : 'ai',
        edited: fields['edited'] === true,
        contributors: contributors(fields['contributors']),
        updated_at: text(fields['updated_at']),
    };
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
    if (!isObject(value)) {
        return null;
    }
    const markdown = text(value['markdown']);

    return markdown === null ? null : {...meta(value), markdown};
}

export function parseQuiz(value: unknown): QuizPart | null {
    if (!isObject(value) || !Array.isArray(value['questions'])) {
        return null;
    }

    return {
        ...meta(value),
        questions: value['questions'].map(parseQuestion).filter((question): question is QuizQuestion => question !== null),
    };
}

export function parseStudyAids(value: unknown): StudyAids | null {
    if (!isObject(value)) {
        return null;
    }
    const videoId = count(value['video_id']);
    if (videoId === null) {
        return null;
    }

    return {
        video_id: videoId,
        can_edit: value['can_edit'] === true,
        can_manage: value['can_manage'] === true,
        generation: GENERATION_STATES.find(state => state === value['generation']) ?? 'none',
        summary: parseSummary(value['summary']),
        quiz: parseQuiz(value['quiz']),
    };
}

export function parseEditor(value: unknown): StudyAidsEditor | null {
    if (!isObject(value)) {
        return null;
    }
    const email = text(value['email']);

    return email ? {
        email,
        name: text(value['name']) || null,
        role: value['role'] === 'admin' ? 'admin' : 'editor',
        added_at: text(value['added_at']),
    } : null;
}

export function parseEditors(value: unknown): StudyAidsEditor[] | null {
    if (!isObject(value) || !Array.isArray(value['editors'])) {
        return null;
    }

    return value['editors'].map(parseEditor).filter((editor): editor is StudyAidsEditor => editor !== null);
}

export function parseImage(value: unknown): UploadedImage | null {
    if (!isObject(value)) {
        return null;
    }
    const url = text(value['url']);

    return url ? {url, width: count(value['width']) ?? 0, height: count(value['height']) ?? 0} : null;
}

/** Laravel's validation errors: field path to messages. */
export function parseErrors(value: unknown): Record<string, string[]> {
    const errors: Record<string, string[]> = {};
    if (isObject(value)) {
        for (const [field, messages] of Object.entries(value)) {
            if (Array.isArray(messages)) {
                errors[field] = messages.filter((message): message is string => typeof message === 'string');
            }
        }
    }

    return errors;
}
