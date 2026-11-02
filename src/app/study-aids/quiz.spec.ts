import {effectiveAnswers, score} from './quiz';
import {QuizQuestion} from './study-aids.model';

const QUESTION: QuizQuestion = {
    id: '01M4D7B2STKMV08W6Z0ZF3G56N',
    prompt: 'เซลล์ชนิดใดมี smooth ER มากที่สุด',
    choices: ['Plasma cell', 'Pancreatic acinar cell', 'Leydig cell', 'Neutrophil', 'Mature red blood cell'],
    answer: 2,
    explanation: 'SER สังเคราะห์ steroid hormone',
    time: 465,
    stats: {answered: 12, correct: 10},
    mine: null,
};

describe('score', () => {
    it('counts right answers only', () => {
        const other = {...QUESTION, id: 'other', answer: 0};

        expect(score([QUESTION, other], {[QUESTION.id]: 2, other: 1})).toBe(1);
    });
});

describe('effectiveAnswers', () => {
    it('takes this device\'s answers, even when it has cleared them', () => {
        const answered = {...QUESTION, mine: 1};

        expect(effectiveAnswers({[QUESTION.id]: 2}, [answered])).toEqual({[QUESTION.id]: 2});
        expect(effectiveAnswers({}, [answered])).toEqual({});
    });

    it('falls back to the first answers the reader gave on any device', () => {
        const other = {...QUESTION, id: 'other', mine: 3};

        expect(effectiveAnswers(null, [QUESTION, other])).toEqual({other: 3});
    });
});
