/**
 * The summary and quiz FlickMan's AI writes for each lecture, as served by `Video.studyAids` in its GraphQL API.
 * Field names follow the API, like the rest of the ManService models.
 */
export interface StudyAids {
    video_id: number;
    generation: GenerationState;
    /** Whether FlickMan has the AI's word-for-word transcript of the lecture. */
    has_transcript: boolean;
    /** The summary points this reader has ticked, from any device; null until they first save some. */
    my_ticks: string[] | null;
    summary: SummaryPart | null;
    quiz: QuizPart | null;
}

/**
 * `none`: no lecture document to work from. `pending`: the AI is writing the parts, which can take
 * up to a day.
 */
export type GenerationState = 'none' | 'pending' | 'ready' | 'failed';

export interface SummaryPart {
    markdown: string;
}

export interface QuizPart {
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

export interface TranscriptParagraph {
    /** Seconds into the lecture where the paragraph starts. */
    time: number;
    text: string;
}

export type TranscriptState =
    | {status: 'loading'}
    | {status: 'ready'; paragraphs: TranscriptParagraph[]}
    /** The lecture has no transcript. */
    | {status: 'none'}
    /** `limited` when this reader has opened too many transcripts for now. */
    | {status: 'error'; limited: boolean};

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
