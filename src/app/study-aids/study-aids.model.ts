/**
 * The summary and quiz FlickMan keeps for each lecture, as served by `GET v1/study_aids/{video}`.
 * Field names follow the API, like the rest of the ManService models.
 */
export interface StudyAids {
    video_id: number;
    /** Whether this user may edit the summary and the questions. */
    can_edit: boolean;
    /** Whether this user is an admin, who also chooses who the editors are. */
    can_manage: boolean;
    generation: GenerationState;
    summary: SummaryPart | null;
    quiz: QuizPart | null;
}

/**
 * `none`: no lecture document to work from. `pending`: the AI is writing the parts, which can take
 * up to a day. A part an editor wrote stays as it is whatever the state.
 */
export type GenerationState = 'none' | 'pending' | 'ready' | 'failed';

/** `ai` parts began as an AI draft and stay `ai` after editing; `editor` parts were written from scratch. */
export type PartOrigin = 'ai' | 'editor';

export interface Contributor {
    name: string;
}

export interface PartMeta {
    /** The version an edit starts from; a save based on an older one is refused. */
    revision: number;
    origin: PartOrigin;
    /** False while the part is an untouched AI draft. */
    edited: boolean;
    /** Editors who chose to be named, in the order they first contributed. */
    contributors: Contributor[];
    updated_at: string | null;
}

export interface SummaryPart extends PartMeta {
    markdown: string;
}

export interface QuizPart extends PartMeta {
    questions: QuizQuestion[];
}

export interface QuizQuestion {
    id: string;
    prompt: string;
    choices: string[];
    /** Index into `choices`. */
    answer: number;
    explanation: string | null;
    /** Seconds into the lecture where the question's topic is taught. */
    time: number | null;
    stats: AnswerStats | null;
    /** This user's first answer, from any device. Only the first answer counts towards the stats. */
    mine: number | null;
}

export interface AnswerStats {
    answered: number;
    correct: number;
}

export type EditorRole = 'editor' | 'admin';

/** Someone allowed to edit study aids, as admins see them in the editors list. */
export interface StudyAidsEditor {
    email: string;
    /** Null until they have signed in to Flick. */
    name: string | null;
    role: EditorRole;
    added_at: string | null;
}

/** An image uploaded for a summary or a question, to be written into its Markdown. */
export interface UploadedImage {
    url: string;
    width: number;
    height: number;
}

/** The co-author box in the editors: whether students see this editor's name, and which name. */
export interface CreditChoice {
    credit: boolean;
    name: string;
}

export interface SummaryChange {
    markdown: string;
    revision: number;
    credit: boolean;
    credit_name: string | null;
}

export interface QuestionChange {
    /** Null for a new question; FlickMan assigns the id. */
    id: string | null;
    prompt: string;
    choices: string[];
    answer: number;
    explanation: string | null;
    time: number | null;
}

export interface QuizChange {
    questions: QuestionChange[];
    revision: number;
    credit: boolean;
    credit_name: string | null;
}

/** Lets the cards read and move the lecture video without depending on the player. */
export interface LecturePlayback {
    currentTime(): number;
    seek(seconds: number): void;
}

export type StudyAidsState =
    | {status: 'loading'}
    | {status: 'ready'; aids: StudyAids}
    /** Nothing to show for this lecture, or no study aids on this server. */
    | {status: 'unavailable'}
    | {status: 'error'};

/** Why a save was refused, in the terms the editors need to explain it. */
export type SaveFailure =
    | {kind: 'conflict'; current: SummaryPart | QuizPart | null}
    | {kind: 'invalid'; message: string; errors: Record<string, string[]>}
    | {kind: 'forbidden'}
    | {kind: 'rate-limited'}
    | {kind: 'network'}
    | {kind: 'failed'; message: string};

/** The limits FlickMan enforces, checked here first so editors see the problem before saving. */
export const LIMITS = {
    summaryChars: 100_000,
    questions: 50,
    promptChars: 2000,
    minChoices: 2,
    maxChoices: 6,
    choiceChars: 500,
    explanationChars: 4000,
    creditNameChars: 50,
    imageBytes: 5_000_000,
    /** Photos larger than this, or wider or taller than imageMaxSide, are shrunk before upload. */
    imageShrinkBytes: 2_000_000,
    imageMaxSide: 2000,
    /** For lectures whose duration is not known. */
    maxTime: 86_400,
};
