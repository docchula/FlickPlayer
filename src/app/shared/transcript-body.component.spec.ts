import {ComponentFixture, TestBed} from '@angular/core/testing';
import {of} from 'rxjs';
import {readingParagraphs, TranscriptBodyComponent} from './transcript-body.component';
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
});
