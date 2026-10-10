/*
 * Word-by-word comparison of saved versions, for showing what editors changed and who changed it.
 *
 * Text is split into words, spaces and marks with the browser's word segmenter, which also splits
 * Thai, written without spaces. A token starting with BLOCK_START begins a block (a point, a
 * heading, a choice): blocks are compared whole first, so only the blocks that changed are
 * compared word by word, which keeps a long summary quick.
 */

export const BLOCK_START = '\u0000';

export type Edit =
    | {op: 'same'; a: number; b: number}
    | {op: 'removed'; a: number}
    | {op: 'added'; b: number};

/** A token as it stands after every version: who added it, and who removed it, by version index. */
export interface Tracked<T> {
    token: T;
    /** Null for a token already in the first version. */
    added: number | null;
    /** Null while the token is still there in the last version. */
    removed: number | null;
}

/** Beyond this many differences two blocks are shown as rewritten rather than word by word. */
const WORD_EDIT_LIMIT = 1500;
const BLOCK_EDIT_LIMIT = 2000;

const wordSegmenter = typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter('th', {granularity: 'word'}) : null;
const letterSegmenter = typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter('th', {granularity: 'grapheme'}) : null;

/** Words, spaces and marks, which joined give back the text. */
export function words(text: string): string[] {
    const clean = text.replaceAll(BLOCK_START, '');
    if (wordSegmenter) {
        return Array.from(wordSegmenter.segment(clean), segment => segment.segment);
    }

    return clean.match(/\s+|[\p{L}\p{M}\p{N}]+|[^\s\p{L}\p{M}\p{N}]/gu) ?? [];
}

/** Letters as readers see them: a Thai consonant with its vowel and tone marks is one. */
export function letters(text: string): string[] {
    return letterSegmenter ? Array.from(letterSegmenter.segment(text), segment => segment.segment) : Array.from(text);
}

export function isWord(token: string): boolean {
    return /[\p{L}\p{N}]/u.test(token);
}

/**
 * Myers' shortest edit script between two lists of tokens, or null when they differ by more than
 * `limit` edits, which would take too long to work out.
 */
export function shortestEdit(a: readonly string[], b: readonly string[], limit: number): Edit[] | null {
    let start = 0;
    while (start < a.length && start < b.length && a[start] === b[start]) {
        start++;
    }
    let endA = a.length;
    let endB = b.length;
    while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
        endA--;
        endB--;
    }

    const n = endA - start;
    const m = endB - start;
    const max = Math.min(n + m, limit);
    const offset = max + 1;
    const v = new Int32Array(2 * max + 3);
    // Before each round, the furthest points reached in the one before, for tracing the path back.
    const trace: Int32Array[] = [];
    let rounds = -1;
    search: for (let d = 0; d <= max; d++) {
        trace.push(v.slice(offset - d - 1, offset + d + 2));
        for (let k = -d; k <= d; k += 2) {
            let x = k === -d || (k !== d && v[offset + k - 1] < v[offset + k + 1]) ? v[offset + k + 1] : v[offset + k - 1] + 1;
            let y = x - k;
            while (x < n && y < m && a[start + x] === b[start + y]) {
                x++;
                y++;
            }
            v[offset + k] = x;
            if (x >= n && y >= m) {
                rounds = d;
                break search;
            }
        }
    }
    if (rounds < 0) {
        return null;
    }

    const edits: Edit[] = [];
    let x = n;
    let y = m;
    for (let d = rounds; d > 0; d--) {
        const before = trace[d];
        const at = (k: number) => before[k + d + 1];
        const k = x - y;
        const previousK = k === -d || (k !== d && at(k - 1) < at(k + 1)) ? k + 1 : k - 1;
        const previousX = at(previousK);
        const previousY = previousX - previousK;
        while (x > previousX && y > previousY) {
            edits.push({op: 'same', a: start + --x, b: start + --y});
        }
        edits.push(x === previousX ? {op: 'added', b: start + --y} : {op: 'removed', a: start + --x});
    }
    while (x > 0 && y > 0) {
        edits.push({op: 'same', a: start + --x, b: start + --y});
    }
    edits.reverse();

    return [
        ...Array.from({length: start}, (_, i): Edit => ({op: 'same', a: i, b: i})),
        ...edits,
        ...Array.from({length: a.length - endA}, (_, i): Edit => ({op: 'same', a: endA + i, b: endB + i})),
    ];
}

function replaced(a: readonly number[], b: readonly number[]): Edit[] {
    return [...a.map((i): Edit => ({op: 'removed', a: i})), ...b.map((j): Edit => ({op: 'added', b: j}))];
}

interface Span {
    start: number;
    end: number;
    key: string;
}

function blocks(tokens: readonly string[]): Span[] {
    const spans: Span[] = [];
    tokens.forEach((token, i) => {
        if (i === 0 || token.startsWith(BLOCK_START)) {
            spans.push({start: i, end: i + 1, key: token});
        } else {
            spans[spans.length - 1].end = i + 1;
            spans[spans.length - 1].key += token;
        }
    });

    return spans;
}

function range(span: Span): number[] {
    return Array.from({length: span.end - span.start}, (_, i) => span.start + i);
}

/** The edits that turn `a` into `b`: unchanged blocks first, then word by word inside the rest. */
export function diffTokens(a: readonly string[], b: readonly string[]): Edit[] {
    const blocksA = blocks(a);
    const blocksB = blocks(b);
    const blockEdits = shortestEdit(blocksA.map(span => span.key), blocksB.map(span => span.key), BLOCK_EDIT_LIMIT)
        ?? replaced(blocksA.map((_, i) => i), blocksB.map((_, j) => j));
    const edits: Edit[] = [];
    let changedA: number[] = [];
    let changedB: number[] = [];
    const compareChanged = () => {
        if (changedA.length || changedB.length) {
            const inner = shortestEdit(changedA.map(i => a[i]), changedB.map(j => b[j]), WORD_EDIT_LIMIT);
            edits.push(...(inner
                ? inner.map((edit): Edit => edit.op === 'same'
                    ? {op: 'same', a: changedA[edit.a], b: changedB[edit.b]}
                    : edit.op === 'removed' ? {op: 'removed', a: changedA[edit.a]} : {op: 'added', b: changedB[edit.b]})
                : replaced(changedA, changedB)));
            changedA = [];
            changedB = [];
        }
    };
    for (const edit of blockEdits) {
        const sameLength = edit.op === 'same'
            && blocksA[edit.a].end - blocksA[edit.a].start === blocksB[edit.b].end - blocksB[edit.b].start;
        if (edit.op === 'same' && sameLength) {
            compareChanged();
            const spanA = blocksA[edit.a];
            const spanB = blocksB[edit.b];
            for (let i = 0; i < spanA.end - spanA.start; i++) {
                edits.push({op: 'same', a: spanA.start + i, b: spanB.start + i});
            }
        } else if (edit.op === 'same') {
            // The same text split differently: compared word by word with the rest.
            changedA.push(...range(blocksA[edit.a]));
            changedB.push(...range(blocksB[edit.b]));
        } else if (edit.op === 'removed') {
            changedA.push(...range(blocksA[edit.a]));
        } else {
            changedB.push(...range(blocksB[edit.b]));
        }
    }
    compareChanged();

    return edits;
}

/**
 * Goes through the versions in order and notes, for every token, which version added it and which
 * removed it. Removed tokens stay where they were, so the result reads as the last version with
 * everything taken out along the way struck through in place.
 */
export function track<T extends {text: string}>(versions: readonly T[][]): Tracked<T>[] {
    let state: Tracked<T>[] = (versions[0] ?? []).map(token => ({token, added: null, removed: null}));
    for (let version = 1; version < versions.length; version++) {
        const tokens = versions[version];
        const shown: number[] = [];
        state.forEach((entry, i) => {
            if (entry.removed === null) {
                shown.push(i);
            }
        });
        const edits = diffTokens(shown.map(i => state[i].token.text), tokens.map(token => token.text));
        const next: Tracked<T>[] = [];
        let kept = 0;
        const keepUpTo = (index: number) => {
            while (kept < index) {
                next.push(state[kept++]);
            }
        };
        for (const edit of edits) {
            if (edit.op === 'added') {
                next.push({token: tokens[edit.b], added: version, removed: null});
            } else {
                const index = shown[edit.a];
                keepUpTo(index);
                kept = index + 1;
                next.push(edit.op === 'same' ? {...state[index], token: tokens[edit.b]} : {...state[index], removed: version});
            }
        }
        keepUpTo(state.length);
        state = next;
    }

    return state;
}

/** What differs between the first version and the last: words added and then removed again are left out. */
export function netChanges<T>(tracked: readonly Tracked<T>[]): Tracked<T>[] {
    return tracked.filter(entry => entry.added === null || entry.removed === null);
}
