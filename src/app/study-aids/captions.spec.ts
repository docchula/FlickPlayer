import {buildCues, splitCaptions, toWebVtt} from './captions';

describe('captions', () => {
    it('cuts a paragraph between words into captions of about two lines', () => {
        const text = 'Nucleus เก็บ genetic material ของเซลล์ Barr body คือ X chromosome ที่ถูก inactivate จนเป็น facultative heterochromatin '
            + 'จำนวน Barr body เท่ากับจำนวน X chromosome ลบหนึ่ง';
        const captions = splitCaptions(text);

        expect(captions.length).toBeGreaterThan(1);
        expect(captions.join(' ')).toBe(text);
        // Thai vowel and tone marks take no room, so a full caption can hold a few more characters.
        expect(captions.every(caption => caption.length <= 94)).toBeTrue();
    });

    it('breaks a long run of Thai with no spaces between its words', () => {
        const run = 'ไมโทคอนเดรียเป็นแหล่งสร้างพลังงานของเซลล์โดยสร้างเอทีพีผ่านกระบวนการหายใจระดับเซลล์ซึ่งต้องใช้ออกซิเจนเป็นตัวรับอิเล็กตรอนตัวสุดท้าย';

        expect(splitCaptions(run).length).toBeGreaterThan(1);
        expect(splitCaptions(run).join('')).toBe(run);
    });

    it('spreads a paragraph\'s captions over its time, by how much each says', () => {
        const cues = buildCues([
            {time: 10, text: 'The smooth ER stores calcium and makes steroid hormones. '.repeat(6).trim()},
            {time: 40, text: 'Next topic.'},
        ], 60);
        const first = cues.filter(cue => cue.start < 40);

        expect(first[0].start).toBe(10);
        expect(first[first.length - 1].end).toBeCloseTo(40, 5);
        first.slice(1).forEach((cue, i) => expect(cue.start).toBeCloseTo(first[i].end, 5));
    });

    it('leaves a long pause after a short paragraph without a caption', () => {
        const cues = buildCues([{time: 0, text: 'เริ่มกันเลย'}, {time: 50, text: 'Lysosome'}], null);

        expect(cues[0].end).toBeLessThan(10);
        expect(cues[1].start).toBe(50);
    });

    it('runs on a paragraph whose stamp goes back in time', () => {
        const cues = buildCues([{time: 100, text: 'one'}, {time: 95, text: 'two'}, {time: 130, text: 'three'}], null);

        expect(cues.map(cue => cue.text)).toEqual(['one two', 'three']);
        expect(cues[0].start).toBe(100);
    });

    it('writes WebVTT a player can read', () => {
        expect(toWebVtt([{start: 3661.5, end: 3663, text: 'pH < 5 & Ca²⁺'}]))
            .toBe('WEBVTT\n\n01:01:01.500 --> 01:01:03.000\npH &lt; 5 &amp; Ca²⁺\n');
    });
});
