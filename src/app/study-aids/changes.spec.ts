import {aiOriginal, authorLabel, ChangeRun, describeChange, quizChanges, summaryChanges} from './changes';
import {QuizRevision, RevisionQuestion, SummaryRevision} from './study-aids.model';

const KAN = {key: 'e1', name: 'Kan'};
const CHAIN = {key: 'e2', name: 'Chain'};
const HIDDEN = {key: 'e3', name: null};

function summary(revision: number, author: SummaryRevision['author'], markdown: string): SummaryRevision {
    return {revision, author, created_at: '2026-10-0' + revision + 'T10:00:00+07:00', content: markdown};
}

function marked(runs: ChangeRun[]): string {
    return runs.map(run => run.change === 'added' ? `[+${run.text}]` : run.change === 'removed' ? `[-${run.text}]` : run.text).join('');
}

const AI = '# Organelles\n\n## Nucleus [00:01:10]\n\n1. **Barr body** : X − 1\n2. **Nucleolus** : makes rRNA\n\n## Lysosome [00:21:40]\n\n1. **Lysosome** : pH 5\n';

describe('summaryChanges', () => {
    it('counts from the AI draft and credits each editor with their own changes', () => {
        const changes = summaryChanges([
            summary(1, null, AI),
            summary(2, KAN, AI.replace('pH 5', 'pH 4.5')),
            summary(3, CHAIN, AI.replace('pH 5', 'pH 4.5').replace('2. **Nucleolus** : makes rRNA\n', '')
                + '2. **Gaucher disease** : glucocerebrosidase\n'),
        ])!;

        expect(changes.base.author).toBeNull();
        expect(changes.authors.map(author => [author.name, author.added, author.removed])).toEqual([['Kan', 1, 1], ['Chain', 3, 3]]);
        const lysosome = changes.blocks.find(block => block.kind === 'point' && block.change === 'edited')!;
        expect(marked(lysosome.runs)).toBe('Lysosome : pH [-5][+4.5]');
        expect(changes.versions[lysosome.runs[1].version!].author).toBe(0);

        const removed = changes.blocks.find(block => block.change === 'removed')!;
        expect(removed.html).toContain('Nucleolus');
        expect(removed.number).toBeNull();
        expect(changes.versions[removed.version!].author).toBe(1);

        const added = changes.blocks.find(block => block.change === 'added')!;
        expect(added.html).toContain('Gaucher disease');
        expect(added.number).toBe(3);
    });

    it('shows a corrected spelling letter by letter', () => {
        const changes = summaryChanges([
            summary(1, null, '1. N-linked glycosilation ใน RER'),
            summary(2, KAN, '1. N-linked glycosylation ใน RER'),
        ])!;

        expect(marked(changes.blocks[0].runs)).toBe('N-linked glycos[-i][+y]lation ใน RER');
    });

    it('marks a changed section time in its heading', () => {
        const changes = summaryChanges([
            summary(1, null, '## Nucleus [00:01:10]\n\n1. Point'),
            summary(2, KAN, '## Nucleus [00:01:30]\n\n1. Point'),
        ])!;

        const runs = changes.blocks[0].runs;
        expect(runs.filter(run => run.change === 'removed').map(run => run.text).join('')).toMatch(/10$/);
        expect(runs.filter(run => run.change === 'added').map(run => run.text).join('')).toMatch(/30$/);
    });

    it('counts a summary an editor wrote from its first version', () => {
        const changes = summaryChanges([summary(1, KAN, '1. One'), summary(2, CHAIN, '1. One\n2. Two')])!;

        expect(changes.base.author).toEqual(KAN);
        expect(changes.blocks.map(block => block.change)).toEqual([null, 'added']);
    });

    it('says nothing changed when nothing did', () => {
        expect(summaryChanges([summary(1, null, AI)])!.changed).toBeFalse();
        expect(summaryChanges([])).toBeNull();
    });

    it('finds the AI\'s own version, and none for an editor\'s summary', () => {
        expect(aiOriginal([summary(1, null, 'first'), summary(2, null, 'second'), summary(3, KAN, 'third')])?.content).toBe('second');
        expect(aiOriginal([summary(1, KAN, 'mine')])).toBeNull();
    });

    it('names editors whose names are hidden by which one they are', () => {
        const changes = summaryChanges([
            summary(1, null, '1. One'),
            summary(2, HIDDEN, '1. One two'),
            summary(3, {key: 'e4', name: null}, '1. One two three'),
        ])!;

        expect(authorLabel(changes, 0)).toBe('Unnamed editor 1');
        expect(authorLabel(changes, 1)).toBe('Unnamed editor 2');
        expect(describeChange(changes, 'added', 1)).toBe('Added by unnamed editor 1 on 2 Oct 2026');
    });
});

describe('quizChanges', () => {
    const question = (id: string, changes: Partial<RevisionQuestion> = {}): RevisionQuestion => ({
        id,
        prompt: 'Which cell has the most smooth ER?',
        choices: ['Plasma cell', 'Leydig cell', 'Neutrophil'],
        answer: 1,
        explanation: 'SER makes steroid hormones.',
        time: 465,
        ...changes,
    });
    const quiz = (revision: number, author: QuizRevision['author'], questions: RevisionQuestion[]): QuizRevision =>
        ({revision, author, created_at: null, content: questions});

    it('marks what changed inside a question, and questions added or removed', () => {
        const changes = quizChanges([
            quiz(1, null, [question('a'), question('b', {prompt: 'Where is rRNA made?'})]),
            quiz(2, KAN, [question('a', {answer: 2, choices: ['Plasma cell', 'Leydig cell', 'Neutrophil', 'Hepatocyte']}), question('c')]),
        ])!;

        const [edited, added, removed] = changes.questions;
        expect([edited.id, edited.change, edited.number]).toEqual(['a', 'edited', 1]);
        const answer = edited.fields.find(field => field.kind === 'answer')!.runs;
        expect(answer.filter(run => run.change === 'removed').map(run => run.text)).toEqual(['B']);
        expect(answer.filter(run => run.change === 'added').map(run => run.text)).toEqual(['C']);
        const newChoice = edited.fields.filter(field => field.kind === 'choice')[3];
        expect([newChoice.change, newChoice.letter]).toEqual(['added', 'D']);

        expect([added.id, added.change, added.number]).toEqual(['c', 'added', 2]);
        expect([removed.id, removed.change, removed.number]).toEqual(['b', 'removed', null]);
        expect(changes.authors[0]).toEqual(jasmine.objectContaining({name: 'Kan'}));
    });

    it('leaves out a question added and taken out again', () => {
        const changes = quizChanges([
            quiz(1, null, [question('a')]),
            quiz(2, KAN, [question('a'), question('b')]),
            quiz(3, CHAIN, [question('a')]),
        ])!;

        expect(changes.questions.map(item => [item.id, item.change])).toEqual([['a', null]]);
        expect(changes.changed).toBeFalse();
    });
});
