import {QuizQuestion} from './study-aids.model';

export const CHOICE_LETTERS = 'ABCDEFGH';

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
