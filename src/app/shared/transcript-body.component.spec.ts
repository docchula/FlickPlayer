import {ComponentFixture, TestBed} from '@angular/core/testing';
import {of} from 'rxjs';
import {readingParagraphs, TranscriptBodyComponent, transcriptFileName, transcriptText} from './transcript-body.component';
import {Lecture} from '../man.service';
import {StudyAidsService} from '../study-aids.service';
import {TranscriptParagraph} from '../study-aids/study-aids.model';

const SENTENCES: TranscriptParagraph[] = [
    {time: 5, text: 'สวัสดีครับ'},
    {time: 9, text: 'วันนี้เราจะคุยเรื่อง spinal cord'},
    {time: 16, text: 'Spinal cord ยาวเต็ม vertebral canal ในเด็กแรกเกิด'},
    {time: 62, text: 'Cervical vertebrae มี C1 ถึง C7'},
];

describe('TranscriptBodyComponent', () => {
    it('groups lines stamped one by one into paragraphs for reading', () => {
        const paragraphs = readingParagraphs(SENTENCES);

        expect(paragraphs.map(paragraph => [paragraph.time, paragraph.lines.map(line => line.index)])).toEqual([[5, [0, 1, 2]], [62, [3]]]);
    });

    it('keeps minute-long paragraphs as they are', () => {
        const long = 'คำ '.repeat(250);

        expect(readingParagraphs([{time: 0, text: long}, {time: 30, text: long}]).length).toBe(2);
    });

    it('writes the transcript as text, each paragraph after the time it starts', () => {
        expect(transcriptText(readingParagraphs(SENTENCES), {title: 'Spinal cord', lecturer: 'อ.นพ.สมชาย'})).toBe([
            'Spinal cord',
            'อ.นพ.สมชาย',
            'Transcribed word for word by AI, which can mishear names and terms.',
            '',
            '[00:00:05] สวัสดีครับ วันนี้เราจะคุยเรื่อง spinal cord Spinal cord ยาวเต็ม vertebral canal ในเด็กแรกเกิด',
            '',
            '[00:01:02] Cervical vertebrae มี C1 ถึง C7',
            '',
        ].join('\n'));
        expect(transcriptText([], {title: 'Spinal cord', lecturer: ''}).split('\n').slice(0, 2)).toEqual([
            'Spinal cord',
            'Transcribed word for word by AI, which can mishear names and terms.',
        ]);
    });

    it('names the file after the lecture, leaving out what file systems refuse', () => {
        expect(transcriptFileName('Spine: C1/C2 "atlas"?')).toBe('Spine C1 C2 atlas - Transcript.txt');
        expect(transcriptFileName('. ')).toBe('Lecture - Transcript.txt');
        expect(transcriptFileName('ไขสันหลัง'.repeat(20)).length).toBe(75 + ' - Transcript.txt'.length);
    });

    it('plays the lecture from a paragraph or from any line in it', async () => {
        TestBed.configureTestingModule({
            imports: [TranscriptBodyComponent],
            providers: [{provide: StudyAidsService, useValue: {transcript: () => of({status: 'ready', paragraphs: SENTENCES})}}],
        });
        const fixture: ComponentFixture<TranscriptBodyComponent> = TestBed.createComponent(TranscriptBodyComponent);
        const seek = jasmine.createSpy('seek');
        fixture.componentRef.setInput('videoId', 7);
        fixture.componentRef.setInput('playback', {currentTime: () => 10, seek: () => undefined});
        fixture.componentInstance.seek.subscribe(seek);
        fixture.detectChanges();
        const element = fixture.nativeElement as HTMLElement;
        const lines = Array.from(element.querySelectorAll<HTMLButtonElement>('button.transcript-line'));

        expect(element.querySelectorAll('.transcript-paragraph').length).toBe(2);
        expect(lines.map(line => line.textContent?.trim())).toEqual(SENTENCES.slice(0, 3).map(line => line.text));
        lines[2].click();
        element.querySelectorAll<HTMLButtonElement>('button.time-chip')[1].click();
        expect(seek.calls.allArgs()).toEqual([[16], [62]]);
        fixture.destroy();
    });

    it('downloads the transcript as a UTF-8 text file named after the lecture', async () => {
        TestBed.configureTestingModule({
            imports: [TranscriptBodyComponent],
            providers: [{provide: StudyAidsService, useValue: {transcript: () => of({status: 'ready', paragraphs: SENTENCES})}}],
        });
        const fixture = TestBed.createComponent(TranscriptBodyComponent);
        const video = {title: 'Spinal cord', lecturer: 'อ.นพ.สมชาย'} as Lecture;
        const createObjectURL = spyOn(URL, 'createObjectURL').and.returnValue('blob:transcript');
        const click = spyOn(HTMLAnchorElement.prototype, 'click');
        fixture.componentRef.setInput('videoId', 7);
        fixture.componentRef.setInput('video', video);
        fixture.detectChanges();
        (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('ion-button.download-button')?.click();

        const file = createObjectURL.calls.mostRecent().args[0] as Blob;
        const link = click.calls.mostRecent().object as HTMLAnchorElement;
        expect(file.type).toBe('text/plain;charset=utf-8');
        expect(Array.from(new Uint8Array(await file.arrayBuffer()).slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
        expect(await file.text()).toBe(transcriptText(readingParagraphs(SENTENCES), video));
        expect(link.download).toBe('Spinal cord - Transcript.txt');
        expect(link.href).toBe('blob:transcript');
        fixture.destroy();
    });
});
