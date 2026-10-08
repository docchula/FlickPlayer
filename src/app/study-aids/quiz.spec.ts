import {blankQuestionForm, errorsByQuestion, questionChange, questionForm, questionProblems, resetsStats, score} from './quiz';
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

describe('questionProblems', () => {
    it('accepts a complete question', () => {
        expect(questionProblems(questionForm(QUESTION, 0), 3000)).toEqual([]);
    });

    it('asks for everything a new question is missing', () => {
        const problems = questionProblems(blankQuestionForm(0), 3000);

        expect(problems).toContain('Write the question.');
        expect(problems).toContain('Fill in or remove the empty choice.');
        expect(problems).toContain('Mark the correct answer.');
    });

    it('refuses choices that differ only in case or spacing', () => {
        const form = {...questionForm(QUESTION, 0), choices: ['Leydig cell', ' leydig CELL ', 'Neutrophil']};

        expect(questionProblems(form, 3000)).toContain('Two choices say the same thing.');
    });

    it('checks the video time against the lecture', () => {
        expect(questionProblems({...questionForm(QUESTION, 0), time: '7:4'}, 3000))
            .toContain('Write the video time as m:ss or h:mm:ss.');
        expect(questionProblems({...questionForm(QUESTION, 0), time: '51:00'}, 3000))
            .toContain('The video time is after the end of the lecture.');
    });

    it('refuses an answer beyond the choices', () => {
        const form = {...questionForm(QUESTION, 0), choices: ['A', 'B'], answer: 2};

        expect(questionProblems(form, 3000)).toContain('Mark the correct answer.');
    });
});

describe('questionChange', () => {
    it('trims what is sent and leaves out empty optional fields', () => {
        const form = {...questionForm(QUESTION, 0), prompt: '  Which?  ', explanation: '   ', time: ''};

        expect(questionChange(form)).toEqual({
            id: QUESTION.id,
            prompt: 'Which?',
            choices: QUESTION.choices,
            answer: 2,
            explanation: null,
            time: null,
        });
    });

    it('sends a new question without an id', () => {
        expect(questionChange(blankQuestionForm(3)).id).toBeNull();
    });
});

describe('resetsStats', () => {
    it('is false for a changed explanation or time', () => {
        expect(resetsStats({...questionForm(QUESTION, 0), explanation: 'Other', time: '1:00'})).toBeFalse();
    });

    it('is true for a changed prompt, choice or answer', () => {
        expect(resetsStats({...questionForm(QUESTION, 0), prompt: 'Changed'})).toBeTrue();
        expect(resetsStats({...questionForm(QUESTION, 0), answer: 1})).toBeTrue();
        const form = questionForm(QUESTION, 0);
        form.choices[4] = 'Platelet';

        expect(resetsStats(form)).toBeTrue();
    });

    it('is false for a question nobody has answered', () => {
        expect(resetsStats({...questionForm(QUESTION, 0), stats: null, prompt: 'Changed'})).toBeFalse();
    });
});

describe('errorsByQuestion', () => {
    it('sorts errors by question', () => {
        const {byQuestion, general} = errorsByQuestion({
            'questions.1.choices.2': ['Choices must be distinct.'],
            'questions.1.answer': ['The answer is out of range.'],
            'revision': ['The revision is required.'],
        });

        expect(byQuestion.get(1)).toEqual(['Choices must be distinct.', 'The answer is out of range.']);
        expect(general).toEqual(['The revision is required.']);
    });
});

describe('score', () => {
    it('counts right answers only', () => {
        const other = {...QUESTION, id: 'other', answer: 0};

        expect(score([QUESTION, other], {[QUESTION.id]: 2, other: 1})).toBe(1);
    });
});
