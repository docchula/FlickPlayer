import {formatStamp, parseTimestamp} from './checklist';
import {normalizeImageLinks} from './images';
import {AnswerStats, LIMITS, QuestionChange, QuizQuestion} from './study-aids.model';

export const CHOICE_LETTERS = 'ABCDEFGH';

/** One question as the quiz editor holds it while it is being changed. */
export interface QuestionForm {
    /** Tracks the question in the editor's list; unrelated to the server id. */
    key: number;
    id: string | null;
    prompt: string;
    choices: string[];
    answer: number | null;
    explanation: string;
    /** As typed, `m:ss` or `h:mm:ss`, or empty. */
    time: string;
    stats: AnswerStats | null;
    /** What the question asked when the editor opened, to tell whether saving resets its stats. */
    original: {prompt: string; choices: string[]; answer: number} | null;
}

/** New questions get five choices, the A–E single-best-answer format FlickMan's AI writes. */
export const NEW_QUESTION_CHOICES = 5;

export function questionForm(question: QuizQuestion, key: number): QuestionForm {
    return {
        key,
        id: question.id,
        prompt: question.prompt,
        choices: [...question.choices],
        answer: question.answer,
        explanation: question.explanation ?? '',
        time: question.time === null ? '' : formatStamp(question.time),
        stats: question.stats,
        original: {prompt: question.prompt, choices: [...question.choices], answer: question.answer},
    };
}

export function blankQuestionForm(key: number): QuestionForm {
    return {
        key,
        id: null,
        prompt: '',
        choices: Array.from({length: NEW_QUESTION_CHOICES}, () => ''),
        answer: null,
        explanation: '',
        time: '',
        stats: null,
        original: null,
    };
}

/** What needs fixing before FlickMan would accept the question. */
export function questionProblems(form: QuestionForm, maxTime: number): string[] {
    const problems: string[] = [];
    const prompt = form.prompt.trim();
    if (!prompt) {
        problems.push('Write the question.');
    } else if (prompt.length > LIMITS.promptChars) {
        problems.push(`Shorten the question to ${LIMITS.promptChars} characters.`);
    }

    const choices = form.choices.map(choice => choice.trim());
    if (choices.length < LIMITS.minChoices) {
        problems.push(`Give at least ${LIMITS.minChoices} choices.`);
    }
    if (choices.some(choice => !choice)) {
        problems.push('Fill in or remove the empty choice.');
    }
    if (choices.some(choice => choice.length > LIMITS.choiceChars)) {
        problems.push(`Shorten each choice to ${LIMITS.choiceChars} characters.`);
    }
    const filled = choices.filter(Boolean).map(choice => choice.toLowerCase());
    if (new Set(filled).size !== filled.length) {
        problems.push('Two choices say the same thing.');
    }
    if (form.answer === null || form.answer >= choices.length) {
        problems.push('Mark the correct answer.');
    }

    if (form.explanation.trim().length > LIMITS.explanationChars) {
        problems.push(`Shorten the explanation to ${LIMITS.explanationChars} characters.`);
    }
    if (form.time.trim()) {
        const time = parseTimestamp(form.time);
        if (time === null) {
            problems.push('Write the video time as m:ss or h:mm:ss.');
        } else if (time > maxTime) {
            problems.push('The video time is after the end of the lecture.');
        }
    }

    return problems;
}

export function questionChange(form: QuestionForm): QuestionChange {
    return {
        id: form.id,
        prompt: normalizeImageLinks(form.prompt.trim()),
        choices: form.choices.map(choice => normalizeImageLinks(choice.trim())),
        answer: form.answer ?? 0,
        explanation: normalizeImageLinks(form.explanation.trim()) || null,
        time: form.time.trim() ? parseTimestamp(form.time) : null,
    };
}

/** FlickMan restarts a question's class stats when what it asks or its answer changes. */
export function resetsStats(form: QuestionForm): boolean {
    if (!form.original || !form.stats?.answered) {
        return false;
    }
    const change = questionChange(form);

    return change.prompt !== form.original.prompt.trim()
        || change.answer !== form.original.answer
        || change.choices.length !== form.original.choices.length
        || change.choices.some((choice, i) => choice !== form.original!.choices[i].trim());
}

/** Sorts Laravel's `questions.3.choices.1`-style errors by question, and the rest. */
export function errorsByQuestion(errors: Record<string, string[]>): {byQuestion: Map<number, string[]>; general: string[]} {
    const byQuestion = new Map<number, string[]>();
    const general: string[] = [];
    for (const [field, messages] of Object.entries(errors)) {
        const match = /^questions\.(\d+)(?:\.|$)/.exec(field);
        if (match) {
            const index = Number(match[1]);
            byQuestion.set(index, [...(byQuestion.get(index) ?? []), ...messages]);
        } else {
            general.push(...messages);
        }
    }

    return {byQuestion, general};
}

/** How many of the given answers are right. */
export function score(questions: QuizQuestion[], answers: Record<string, number>): number {
    return questions.filter(question => answers[question.id] === question.answer).length;
}

/** The answers to show: this device's, or else the first answers the reader gave on any device. */
export function effectiveAnswers(stored: Record<string, number> | null, questions: QuizQuestion[]): Record<string, number> {
    return stored ?? Object.fromEntries(questions
        .filter(question => question.mine !== null)
        .map(question => [question.id, question.mine as number]));
}
