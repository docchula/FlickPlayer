import {seekThumbnailCues, seekThumbnailUrl} from './seek-thumbnails';

describe('seek-thumbnails', () => {
    const host = 'https://stream.example.com';
    const hls = (file: string, playlist = 'index.m3u8') => ({src: `${host}/hls/2024/Course/Lecture 1/${file}/${playlist}?key=abc%3D`});

    describe('seekThumbnailUrl', () => {
        it('captures from the nginx-vod file behind an HLS source, keeping the stream key', () => {
            const urlAt = seekThumbnailUrl([hls('h264.mp4')]);
            expect(urlAt?.(65.4)).toBe(`${host}/thumb/2024/Course/Lecture 1/h264.mp4/thumb-65400-w240.jpg?key=abc%3D`);
        });

        it('prefers the file cheapest to decode', () => {
            const urlAt = seekThumbnailUrl([hls('av1.mp4', 'master.m3u8'), hls('hevc.mp4'), hls('h264.mp4')]);
            expect(urlAt?.(0)).toContain('/h264.mp4/thumb-0-');
            expect(seekThumbnailUrl([hls('av1.mp4', 'master.m3u8'), hls('hevc.mp4')])?.(0)).toContain('/hevc.mp4/thumb-0-');
        });

        it('works without a stream key', () => {
            expect(seekThumbnailUrl([{src: `${host}/hls/tester.mp4/index.m3u8`}])?.(1)).toBe(`${host}/thumb/tester.mp4/thumb-1000-w240.jpg`);
        });

        it('is null without an nginx-vod HLS source', () => {
            expect(seekThumbnailUrl([
                {src: 'https://www.youtube.com/watch?v=x'},
                {src: `${host}/stream/2024/Course/Lecture/master.m3u8?key=abc`},
                {src: `${host}/videos/2024/Course/Lecture/vp9.webm?key=abc`},
                {},
            ])).toBeNull();
        });
    });

    describe('seekThumbnailCues', () => {
        it('covers the whole video with contiguous cues, each showing its middle', () => {
            const cues = seekThumbnailCues([hls('h264.mp4')], 25);
            expect(cues.map(c => [c.startTime, c.endTime])).toEqual([[0, 10], [10, 20], [20, 25]]);
            expect(cues[2].text).toContain('/thumb-22500-w240.jpg');
        });

        it('caps the number of images for long videos', () => {
            const cues = seekThumbnailCues([hls('h264.mp4')], 3 * 3600);
            expect(cues.length).toBeLessThanOrEqual(240);
            expect(cues[cues.length - 1].endTime).toBe(3 * 3600);
        });

        it('is empty without a known duration or a source to capture from', () => {
            expect(seekThumbnailCues([hls('h264.mp4')], undefined)).toEqual([]);
            expect(seekThumbnailCues([hls('h264.mp4')], NaN)).toEqual([]);
            expect(seekThumbnailCues([hls('h264.mp4')], Infinity)).toEqual([]);
            expect(seekThumbnailCues([{src: 'https://www.youtube.com/watch?v=x'}], 60)).toEqual([]);
        });
    });
});
