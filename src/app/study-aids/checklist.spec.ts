import {buildChecklist, formatClock, formatStamp, parseTimestamp, plainText, renderInline} from './checklist';

// Shaped like FlickMan's demo summary: numbering restarts in every section, as the AI writes it.
const SUMMARY = `# Organelles

## Nucleus [00:01:10]

1. **Barr body** : inactivated X = facultative heterochromatin; จำนวน Barr body = จำนวน X − 1
2. **Nucleolus** : สังเคราะห์ rRNA และประกอบ ribosomal subunit

## Endoplasmic reticulum [00:06:30]

1. **RER** : เริ่ม ==N-linked glycosylation (O-linked เกิดที่ Golgi)==
2. **SER** : เก็บ intracellular Ca²⁺

## Lysosome [00:21:40]

1. **Gaucher disease** : ขาด glucocerebrosidase (*GBA1*)
   1. Gaucher cell : cytoplasm แบบ "crumpled tissue paper"
   2. Hepatosplenomegaly, pancytopenia, bone crisis
2. **Catalase** : $2\\,H_2O_2 \\rightarrow 2\\,H_2O + O_2$

### Compared

| | Apoptosis | Necrosis |
|---|---|---|
| Cell | หดเล็กลง | บวม |
`;

describe('buildChecklist', () => {
    const checklist = buildChecklist(SUMMARY);
    const points = checklist.sections.flatMap(section => section.blocks.filter(block => block.kind === 'point'));

    it('takes the first heading as the title', () => {
        expect(checklist.title).toBe('Organelles');
    });

    it('makes a section of each second-level heading and reads its time', () => {
        expect(checklist.sections.length).toBe(3);
        expect(checklist.sections.map(section => section.time)).toEqual([70, 390, 1300]);
        expect(checklist.sections[0].headingHtml).toBe('Nucleus');
    });

    it('numbers the points straight through the summary', () => {
        expect(points.map(point => point.number)).toEqual([1, 2, 3, 4, 5, 6]);
        expect(checklist.pointKeys.length).toBe(6);
    });

    it('keeps sub-points inside their point', () => {
        const gaucher = points[4];

        expect(gaucher.html).toContain('<ol>');
        expect(gaucher.html).toContain('crumpled tissue paper');
        expect(points.length).toBe(6);
    });

    it('renders highlights, key terms and maths placeholders', () => {
        expect(points[2].html).toContain('<mark>N-linked glycosylation (O-linked เกิดที่ Golgi)</mark>');
        expect(points[0].html).toContain('<strong>Barr body</strong>');
        expect(points[5].html).toContain('class="math-inline"');
    });

    it('keeps labels and tables as blocks of their own', () => {
        const blocks = checklist.sections[2].blocks;

        expect(blocks.some(block => block.kind === 'label' && block.html === 'Compared')).toBeTrue();
        expect(blocks.some(block => block.kind === 'html' && block.html.includes('<table>'))).toBeTrue();
    });

    it('keys a point by its text, so editing another point keeps its tick', () => {
        const edited = buildChecklist(SUMMARY.replace('**SER**', '**SER (smooth ER)**'));

        expect(edited.pointKeys[0]).toBe(checklist.pointKeys[0]);
        expect(edited.pointKeys[3]).not.toBe(checklist.pointKeys[3]);
    });

    it('gives repeated points different keys', () => {
        const repeated = buildChecklist('1. Same point\n2. Same point\n');

        expect(new Set(repeated.pointKeys).size).toBe(2);
    });

    it('puts content before any heading into a section without a heading', () => {
        const loose = buildChecklist('1. First\n\n## Later\n\n1. Second\n');

        expect(loose.title).toBeNull();
        expect(loose.sections[0].headingHtml).toBeNull();
        expect(loose.sections[1].headingHtml).toBe('Later');
        expect(loose.pointKeys.length).toBe(2);
    });

    it('leaves a heading alone when its time is not a real time', () => {
        const odd = buildChecklist('## Odd [00:75:00]\n');

        expect(odd.sections[0].time).toBeNull();
        expect(odd.sections[0].headingHtml).toContain('[00:75:00]');
    });

    it('opens links in a new tab', () => {
        expect(renderInline('[notes](https://example.com)')).toContain('target="_blank"');
    });

    it('shows images FlickMan stored', () => {
        const html = renderInline('![ER](https://flick-man-app.docchula.com/v1/study_aids/images/01M4D7B2STKMV08W6Z0ZF3G56N.webp)');

        expect(html).toContain('<img src="https://flick-man-app.docchula.com/v1/study_aids/images/01M4D7B2STKMV08W6Z0ZF3G56N.webp" alt="ER">');
    });

    it('turns any other image into a link, so nothing loads from elsewhere', () => {
        const markdown = '![pixel](https://tracker.example/p.gif) <img src="https://docchula.com.example/v1/study_aids/images/x.png" alt="raw">';
        const html = renderInline(markdown);

        expect(html).not.toContain('<img');
        expect(html).toContain('<a href="https://tracker.example/p.gif" target="_blank" rel="noopener noreferrer">pixel</a>');
        expect(html).toContain('>raw</a>');
    });
});

describe('timestamps', () => {
    it('reads m:ss, mm:ss and h:mm:ss', () => {
        expect(parseTimestamp('7:45')).toBe(465);
        expect(parseTimestamp('07:45')).toBe(465);
        expect(parseTimestamp('1:02:03')).toBe(3723);
        expect(parseTimestamp(' 00:01:10 ')).toBe(70);
    });

    it('refuses what is not a time', () => {
        expect(parseTimestamp('')).toBeNull();
        expect(parseTimestamp('7:60')).toBeNull();
        expect(parseTimestamp('1:60:00')).toBeNull();
        expect(parseTimestamp('abc')).toBeNull();
    });

    it('formats for reading and for writing', () => {
        expect(formatClock(465)).toBe('7:45');
        expect(formatClock(3723)).toBe('1:02:03');
        expect(formatStamp(465)).toBe('00:07:45');
        expect(formatStamp(465.9)).toBe('00:07:45');
    });
});

describe('plainText', () => {
    it('drops the formatting', () => {
        expect(plainText('**Bold** and ==marked==\nline')).toBe('Bold and marked line');
    });
});
