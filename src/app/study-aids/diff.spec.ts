import {BLOCK_START, diffTokens, Edit, netChanges, shortestEdit, track, words} from './diff';

/** Applies edits to `a` and returns what they make, to check they really turn it into `b`. */
function apply(a: string[], b: string[], edits: Edit[]): string[] {
    return edits.flatMap(edit => edit.op === 'same' ? [a[edit.a]] : edit.op === 'added' ? [b[edit.b]] : []);
}

function versions(...texts: string[]): {text: string}[][] {
    return texts.map(text => words(text).map(word => ({text: word})));
}

describe('diff', () => {
    it('splits Thai written without spaces into words', () => {
        const tokens = words('ไมโทคอนเดรียสร้าง ATP');

        expect(tokens.join('')).toBe('ไมโทคอนเดรียสร้าง ATP');
        expect(tokens.length).toBeGreaterThan(3);
    });

    it('finds the fewest edits between two lists', () => {
        const a = ['the', ' ', 'smooth', ' ', 'ER', ' ', 'stores', ' ', 'calcium'];
        const b = ['the', ' ', 'rough', ' ', 'ER', ' ', 'stores', ' ', 'protein', ' ', 'too'];
        const edits = shortestEdit(a, b, 100)!;

        expect(apply(a, b, edits)).toEqual(b);
        expect(edits.filter(edit => edit.op !== 'same').length).toBe(6);
    });

    it('gives up when two lists differ too much to compare quickly', () => {
        expect(shortestEdit(['a', 'b', 'c'], ['x', 'y', 'z'], 2)).toBeNull();
    });

    it('compares blocks whole before their words', () => {
        const a = [BLOCK_START + 'point', 'Golgi', BLOCK_START + 'point', 'Lysosome', ' ', 'pH', ' ', '5'];
        const b = [BLOCK_START + 'point', 'Golgi', BLOCK_START + 'point', 'Lysosome', ' ', 'pH', ' ', '4.5', BLOCK_START + 'point', 'New'];
        const edits = diffTokens(a, b);

        expect(apply(a, b, edits)).toEqual(b);
        expect(edits.filter(edit => edit.op === 'removed').map(edit => a[(edit as {a: number}).a])).toEqual(['5']);
    });

    it('credits each change to the version that made it', () => {
        const tracked = track(versions('Lysosome pH 5', 'Lysosome pH 4.5', 'Lysosome pH 4.5 to 5'));
        const changes = tracked
            .filter(entry => entry.added !== null || entry.removed !== null)
            .map(entry => [entry.token.text, entry.added, entry.removed]);

        expect(changes).toEqual([['5', null, 1], ['4.5', 1, null], [' ', 2, null], ['to', 2, null], [' ', 2, null], ['5', 2, null]]);
    });

    it('leaves out words added and removed again', () => {
        const tracked = netChanges(track(versions('Nucleus', 'Nucleus nucleolus', 'Nucleus')));

        expect(tracked.map(entry => entry.token.text)).toEqual(['Nucleus']);
        expect(tracked.every(entry => entry.added === null && entry.removed === null)).toBeTrue();
    });
});
