import {formatDay} from './byline';
import {buildChecklist, formatClock, renderBlock, renderInline} from './checklist';
import {BLOCK_START, isWord, letters, netChanges, track, Tracked, words} from './diff';
import {DRIVE_IMAGE_CLASS} from './images';
import {CHOICE_LETTERS} from './quiz';
import {QuizRevision, Revision, RevisionAuthor, RevisionQuestion, SummaryRevision} from './study-aids.model';

/*
 * What the Changes view shows: how the summary or the quiz differs from the AI's draft (or, for a
 * part an editor wrote, from its first version), with every word added or removed credited to the
 * editor whose save did it.
 */

export interface ChangeAuthor {
    key: string;
    /** Null when this reader may not see the editor's name. */
    name: string | null;
    /** Words this editor's saves added and removed, as they stand now. */
    added: number;
    removed: number;
}

export interface ChangeVersion {
    revision: number;
    /** Index into the authors; null for the version the changes are counted from. */
    author: number | null;
    created_at: string | null;
}

/** A stretch of text one save added or removed, or that nobody changed. */
export interface ChangeRun {
    text: string;
    change: 'added' | 'removed' | null;
    /** Index into the versions. */
    version: number | null;
}

/** A block or a question added or removed whole, partly changed, or left alone. */
export type Change = 'added' | 'removed' | 'edited' | null;

export type SummaryBlockKind = 'title' | 'heading' | 'label' | 'point' | 'html';

export interface ChangedBlock {
    kind: SummaryBlockKind;
    /** The block as last saved, drawn as usual unless only some of its words changed. */
    html: string;
    time: number | null;
    change: Change;
    /** The version that added or removed the whole block. */
    version: number | null;
    /** Its words, when only some of them changed. */
    runs: ChangeRun[];
    /** The point's number in the summary as it is now. */
    number: number | null;
}

export type QuestionFieldKind = 'prompt' | 'choice' | 'answer' | 'time' | 'explanation';

export interface ChangedField {
    kind: QuestionFieldKind;
    change: Change;
    version: number | null;
    runs: ChangeRun[];
    /** A choice's letter in the question as it is now; null for a removed choice. */
    letter: string | null;
}

export interface ChangedQuestion {
    id: string;
    change: Change;
    version: number | null;
    /** Its number in the quiz as it is now; null for a removed question. */
    number: number | null;
    /** The question as last saved. */
    question: RevisionQuestion;
    fields: ChangedField[];
}

export interface History {
    /** The version the changes are counted from. */
    base: {revision: number; author: RevisionAuthor | null; created_at: string | null};
    authors: ChangeAuthor[];
    /** Index 0 is the base. */
    versions: ChangeVersion[];
    /** Whether anything differs from the base. */
    changed: boolean;
}

/** Earlier versions as fetched for the AI original and Changes views. */
export type HistoryState<T> =
    | {status: 'loading'}
    | {status: 'ready'; revisions: Revision<T>[]}
    | {status: 'error'; message: string};

export interface SummaryChanges extends History {
    blocks: ChangedBlock[];
}

export interface QuizChanges extends History {
    questions: ChangedQuestion[];
}

interface Token {
    text: string;
    /** On the token that starts a summary block. */
    block?: {kind: SummaryBlockKind; html: string; time: number | null};
}

/** The AI's last draft, which editors started from; the first version when an editor wrote the part. */
function baseIndex<T>(revisions: readonly Revision<T>[]): number {
    let base = 0;
    revisions.forEach((revision, i) => {
        if (revision.author === null) {
            base = i;
        }
    });

    return base;
}

/** The AI's own version before any editor changed it, or null when an editor wrote the part. */
export function aiOriginal<T>(revisions: readonly Revision<T>[]): Revision<T> | null {
    return [...revisions].reverse().find(revision => revision.author === null) ?? null;
}

let inertDocument: Document | null = null;

/** The words of rendered HTML, with pictures named so that adding or removing one shows. */
function textOf(html: string): string {
    inertDocument ??= document.implementation.createHTMLDocument('');
    const holder = inertDocument.createElement('div');
    holder.innerHTML = html;
    holder.querySelectorAll(`a.${DRIVE_IMAGE_CLASS}`).forEach(picture => picture.replaceWith(`[${picture.textContent || 'image'}]`));

    return (holder.textContent ?? '').replace(/\s+/g, ' ').trim();
}

function escapeHtml(text: string): string {
    return text.replace(/[&<>"]/g, character => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'})[character] as string);
}

function blockTokens(kind: string, text: string, block?: Token['block']): Token[] {
    return [{text: BLOCK_START + kind, block}, ...words(text).map(word => ({text: word}))];
}

function summaryTokens(markdown: string): Token[] {
    const checklist = buildChecklist(markdown);
    const tokens: Token[] = [];
    if (checklist.title) {
        tokens.push(...blockTokens('title', checklist.title, {kind: 'title', html: escapeHtml(checklist.title), time: null}));
    }
    for (const section of checklist.sections) {
        if (section.headingHtml || section.time !== null) {
            const text = [section.headingText ?? '', section.time === null ? '' : `[${formatClock(section.time)}]`].join(' ').trim();
            tokens.push(...blockTokens('heading', text, {kind: 'heading', html: section.headingHtml ?? '', time: section.time}));
        }
        for (const block of section.blocks) {
            tokens.push(...blockTokens(block.kind, textOf(block.html), {kind: block.kind, html: block.html, time: null}));
        }
    }

    return tokens;
}

function questionTokens(question: RevisionQuestion): Token[] {
    return [
        ...blockTokens('prompt', textOf(renderBlock(question.prompt))),
        ...question.choices.flatMap(choice => blockTokens('choice', textOf(renderInline(choice)))),
        ...blockTokens('answer', CHOICE_LETTERS[question.answer] ?? String(question.answer + 1)),
        ...(question.time === null ? [] : blockTokens('time', formatClock(question.time))),
        ...(question.explanation ? blockTokens('explanation', textOf(renderBlock(question.explanation))) : []),
    ];
}

interface Group {
    start: Tracked<Token>;
    words: Tracked<Token>[];
}

function groups(tracked: readonly Tracked<Token>[]): Group[] {
    const result: Group[] = [];
    for (const entry of tracked) {
        if (entry.token.text.startsWith(BLOCK_START)) {
            result.push({start: entry, words: []});
        } else {
            result[result.length - 1]?.words.push(entry);
        }
    }

    return result;
}

function changeOf(entries: readonly Tracked<Token>[]): {change: Change; version: number | null} {
    if (entries.every(entry => entry.added === null && entry.removed === null)) {
        return {change: null, version: null};
    }
    const added = entries[0].added;
    if (added !== null && entries.every(entry => entry.added === added && entry.removed === null)) {
        return {change: 'added', version: added};
    }
    const removed = entries[0].removed;
    if (removed !== null && entries.every(entry => entry.removed === removed)) {
        return {change: 'removed', version: removed};
    }

    return {change: 'edited', version: null};
}

/** A word one save swapped for a near copy, such as a corrected spelling: only the letters that differ. */
function letterRuns(first: Tracked<Token>, second: Tracked<Token>): ChangeRun[] | null {
    const [gone, come] = first.removed !== null ? [first, second] : [second, first];
    const version = gone.removed;
    if (version === null || gone.added !== null || come.added !== version || come.removed !== null
        || !isWord(gone.token.text) || !isWord(come.token.text)) {
        return null;
    }
    const before = letters(gone.token.text);
    const after = letters(come.token.text);
    const shorter = Math.min(before.length, after.length);
    let prefix = 0;
    while (prefix < shorter && before[prefix] === after[prefix]) {
        prefix++;
    }
    let suffix = 0;
    while (suffix < shorter - prefix && before[before.length - 1 - suffix] === after[after.length - 1 - suffix]) {
        suffix++;
    }
    if (shorter < 3 || prefix + suffix < shorter / 2) {
        return null;
    }

    return [
        {text: before.slice(0, prefix).join(''), change: null, version: null},
        {text: before.slice(prefix, before.length - suffix).join(''), change: 'removed', version},
        {text: after.slice(prefix, after.length - suffix).join(''), change: 'added', version},
        {text: before.slice(before.length - suffix).join(''), change: null, version: null},
    ];
}

function runsOf(entries: readonly Tracked<Token>[]): ChangeRun[] {
    const runs: ChangeRun[] = [];
    const push = (run: ChangeRun) => {
        const last = runs[runs.length - 1];
        if (!run.text) {
            return;
        }
        if (last && last.change === run.change && last.version === run.version) {
            last.text += run.text;
        } else {
            runs.push({...run});
        }
    };
    for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        const refined = i + 1 < entries.length ? letterRuns(entry, entries[i + 1]) : null;
        if (refined) {
            refined.forEach(push);
            i++;
        } else {
            push({
                text: entry.token.text,
                change: entry.removed !== null ? 'removed' : entry.added !== null ? 'added' : null,
                version: entry.removed ?? entry.added,
            });
        }
    }

    return runs;
}

function historyOf<T>(used: readonly Revision<T>[], tracked: readonly Tracked<Token>[]): History {
    const authors: ChangeAuthor[] = [];
    const versions: ChangeVersion[] = used.map((revision, i) => {
        if (i === 0) {
            return {revision: revision.revision, author: null, created_at: revision.created_at};
        }
        const key = revision.author?.key || (revision.author ? 'editor' : 'ai');
        let author = authors.findIndex(known => known.key === key);
        if (author < 0) {
            author = authors.push({key, name: revision.author ? revision.author.name : 'AI', added: 0, removed: 0}) - 1;
        }

        return {revision: revision.revision, author, created_at: revision.created_at};
    });
    let changed = false;
    for (const entry of tracked) {
        const version = entry.removed ?? entry.added;
        if (version === null) {
            continue;
        }
        changed = true;
        const author = versions[version]?.author;
        if (author !== null && author !== undefined && !entry.token.text.startsWith(BLOCK_START) && isWord(entry.token.text)) {
            authors[author][entry.removed !== null ? 'removed' : 'added']++;
        }
    }

    return {
        base: {revision: used[0].revision, author: used[0].author, created_at: used[0].created_at},
        authors,
        versions,
        changed,
    };
}

export function summaryChanges(revisions: readonly SummaryRevision[]): SummaryChanges | null {
    if (!revisions.length) {
        return null;
    }
    const used = revisions.slice(baseIndex(revisions));
    const tracked = netChanges(track(used.map(revision => summaryTokens(revision.content))));
    let number = 0;
    const blocks = groups(tracked).map((group): ChangedBlock => {
        const block = group.start.token.block ?? {kind: 'html' as const, html: '', time: null};
        const {change, version} = changeOf([group.start, ...group.words]);
        const shown = group.start.removed === null;

        return {
            kind: block.kind,
            html: block.html,
            time: block.time,
            change,
            version,
            runs: change === 'edited' ? runsOf(group.words) : [],
            number: block.kind === 'point' && shown ? ++number : null,
        };
    });

    return {...historyOf(used, tracked), blocks};
}

export function quizChanges(revisions: readonly QuizRevision[]): QuizChanges | null {
    if (!revisions.length) {
        return null;
    }
    const used = revisions.slice(baseIndex(revisions));
    const latest = used[used.length - 1].content;
    const ids = new Set<string>(latest.map(question => question.id));
    used.forEach(version => version.content.forEach(question => ids.add(question.id)));

    const everything: Tracked<Token>[] = [];
    const questions: ChangedQuestion[] = [];
    for (const id of ids) {
        const present = used.map(version => version.content.find(question => question.id === id) ?? null);
        const kept = present.map((question, i) => question ? i : -1).filter(i => i >= 0);
        const first = kept[0];
        const last = kept[kept.length - 1];
        const removedIn = last < used.length - 1 ? last + 1 : null;
        // Added and taken out again: nothing to show.
        if (first > 0 && removedIn !== null) {
            continue;
        }
        const tracked = netChanges(track(kept.map(i => questionTokens(present[i] as RevisionQuestion))).map(entry => ({
            token: entry.token,
            added: entry.added === null ? (first > 0 ? first : null) : kept[entry.added],
            removed: entry.removed === null ? removedIn : kept[entry.removed],
        })));
        everything.push(...tracked);

        const {change, version} = changeOf(tracked);
        const number = latest.findIndex(question => question.id === id);
        let letter = 0;
        questions.push({
            id,
            change,
            version,
            number: number < 0 ? null : number + 1,
            question: present[last] as RevisionQuestion,
            fields: groups(tracked).map((group): ChangedField => {
                const kind = group.start.token.text.slice(BLOCK_START.length) as QuestionFieldKind;
                const field = changeOf([group.start, ...group.words]);

                return {
                    kind,
                    change: field.change,
                    version: field.version,
                    runs: runsOf(group.words),
                    letter: kind === 'choice' && group.start.removed === null ? CHOICE_LETTERS[letter++] ?? String(letter) : null,
                };
            }),
        });
    }
    // The quiz's own order, then whatever was taken out.
    questions.sort((a, b) => (a.number ?? Infinity) - (b.number ?? Infinity));

    return {...historyOf(used, everything), questions};
}

/** How many theme colours editors are told apart by; see _changes.scss. */
export const EDITOR_COLOURS = 6;

/** An editor's display name, or for one whose name is hidden from this reader, which one they are. */
export function authorLabel(history: History, author: number): string {
    const known = history.authors[author];
    if (known?.name) {
        return known.name;
    }
    const unnamed = history.authors.filter(other => !other.name);

    return known && unnamed.length > 1 ? `Unnamed editor ${unnamed.indexOf(known) + 1}` : 'Unnamed editor';
}

/** The class that colours a change by the editor who made it. */
export function changeClass(history: History, version: number | null): string {
    const author = version === null ? null : history.versions[version]?.author ?? null;

    return author === null ? '' : 'by-' + author % EDITOR_COLOURS;
}

/** "Added by Kan on 9 Oct 2026". */
export function describeChange(history: History, change: 'added' | 'removed', version: number | null): string {
    const saved = version === null ? null : history.versions[version];
    const verb = change === 'added' ? 'Added' : 'Removed';
    if (!saved || saved.author === null) {
        return verb;
    }

    const label = authorLabel(history, saved.author);
    const who = history.authors[saved.author]?.name ? label : label === 'Unnamed editor' ? 'an unnamed editor' : label.toLowerCase();

    return `${verb} by ${who}${saved.created_at ? ' on ' + formatDay(saved.created_at) : ''}`;
}
