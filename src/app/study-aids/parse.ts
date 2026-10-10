import {
    AnswerStats,
    Contributor,
    EditorProfile,
    GenerationState,
    PartMeta,
    QuizPart,
    QuizQuestion,
    QuizRevision,
    Revision,
    RevisionAuthor,
    RevisionQuestion,
    StudyAids,
    StudyAidsEditor,
    SummaryPart,
    SummaryRevision,
    TranscriptParagraph,
    Verification,
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

/** GraphQL sends IDs as strings: "7". */
function numericId(value: unknown): number | null {
    return count(typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value);
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

function verification(value: unknown): Verification | null {
    if (!isObject(value)) {
        return null;
    }
    const revision = count(value['revision']);
    const by = contributors(value['by']);

    return revision !== null && by.length ? {revision, by, at: text(value['at'])} : null;
}

function meta(fields: Fields): PartMeta {
    return {
        revision: count(fields['revision']) ?? 0,
        origin: fields['origin'] === 'editor' ? 'editor' : 'ai',
        edited: fields['edited'] === true,
        contributors: contributors(fields['contributors']),
        updated_at: text(fields['updated_at']),
        verified: verification(fields['verified']),
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

function parseRevisionQuestion(value: unknown): RevisionQuestion | null {
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

    return {id, prompt, choices, answer, explanation: text(value['explanation']) || null, time: seconds(value['time'])};
}

function parseQuestion(value: unknown): QuizQuestion | null {
    const question = parseRevisionQuestion(value);
    if (!question || !isObject(value)) {
        return null;
    }
    const mine = count(value['mine']);

    return {
        ...question,
        stats: parseStats(value['stats']),
        mine: mine !== null && mine < question.choices.length ? mine : null,
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
    const videoId = numericId(value['video_id']);
    if (videoId === null) {
        return null;
    }

    return {
        video_id: videoId,
        can_edit: value['can_edit'] === true,
        can_manage: value['can_manage'] === true,
        generation: GENERATION_STATES.find(state => state === value['generation']) ?? 'none',
        has_transcript: value['has_transcript'] === true,
        my_ticks: Array.isArray(value['my_ticks']) ? value['my_ticks'].filter((key): key is string => typeof key === 'string') : null,
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

function author(value: unknown): RevisionAuthor | null {
    if (!isObject(value)) {
        return null;
    }

    return {key: text(value['key']) ?? '', name: text(value['name'])?.trim() || null};
}

function revisions<T>(value: unknown, content: (fields: Fields) => T | null): Revision<T>[] | null {
    if (!isObject(value) || !Array.isArray(value['revisions'])) {
        return null;
    }
    const parsed: Revision<T>[] = [];
    for (const entry of value['revisions']) {
        if (!isObject(entry)) {
            continue;
        }
        const revision = count(entry['revision']);
        const saved = content(entry);
        if (revision !== null && saved !== null) {
            parsed.push({revision, author: author(entry['author']), created_at: text(entry['created_at']), content: saved});
        }
    }

    return parsed.sort((a, b) => a.revision - b.revision);
}

export function parseSummaryRevisions(value: unknown): SummaryRevision[] | null {
    return revisions(value, fields => text(fields['markdown']));
}

export function parseQuizRevisions(value: unknown): QuizRevision[] | null {
    return revisions(value, fields => Array.isArray(fields['questions'])
        ? fields['questions'].map(parseRevisionQuestion).filter((question): question is RevisionQuestion => question !== null)
        : null);
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

export function parseProfile(value: unknown): EditorProfile | null {
    if (!isObject(value)) {
        return null;
    }
    const name = text(value['name'])?.trim();

    return name ? {name, changed_at: text(value['changed_at']), next_change_at: text(value['next_change_at'])} : null;
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
