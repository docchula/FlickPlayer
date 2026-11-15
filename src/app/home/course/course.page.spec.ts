import {BehaviorSubject} from 'rxjs';
import {CoursePage} from './course.page';
import {CourseMembers, EvaluationRecord, Lecture} from '../../man.service';
import {PlayHistory} from '../../play-tracker.service';

// These methods are pure enough to call directly on a plain context object,
// avoiding TestBed entirely and sidestepping ngAfterViewInit's media stream init.
function lecture(overrides: Partial<Lecture> & {id: number}): Lecture {
    return {
        title: 'Untitled',
        lecturer: 'Someone',
        date: null,
        sources: [],
        attachments: [],
        ...overrides,
    };
}

describe('CoursePage.mergeVideoInfo', () => {
    it('accumulates progress, finds the most recently played video, and preserves order without .m3u8 sources', () => {
        const ctx = {} as CoursePage;
        const videos: CourseMembers = {
            '1': lecture({id: 1, title: 'B', duration: 100, sources: [{type: 'video/mp4', server: null, src: 'a'}]}),
            '2': lecture({id: 2, title: 'A', duration: 200, sources: [{type: 'video/mp4', server: null, src: 'b'}]}),
        };
        const history: PlayHistory = {
            '1': {end_time: 50, played_at: '2024-01-02' as never, video_id: 1},
            '2': {end_time: 0, played_at: '2024-01-01' as never, video_id: 2},
        };

        const result = CoursePage.prototype.mergeVideoInfo.call(ctx, videos, history, {});

        expect(result.map(v => v.title)).toEqual(['B', 'A']);
        expect(ctx.lastPlayedVideoKey).toBe(1);
        expect(ctx.courseProgress).toEqual({viewed: 50, duration: 300});
        expect(result[0].is_evaluated).toBe(false);
    });

    it('sorts by title when any lecture has an .m3u8 source', () => {
        const ctx = {} as CoursePage;
        const videos: CourseMembers = {
            '1': lecture({id: 1, title: 'B', sources: [{type: 'application/x-mpegURL', path: 'x.m3u8', server: null, src: ''}]}),
            '2': lecture({id: 2, title: 'A', sources: []}),
        };

        const result = CoursePage.prototype.mergeVideoInfo.call(ctx, videos, {}, {});

        expect(result.map(v => v.title)).toEqual(['A', 'B']);
    });

    it('synthesizes a watched history entry from an evaluation when duration is known', () => {
        const ctx = {} as CoursePage;
        const videos: CourseMembers = {
            '3': lecture({id: 3, duration: 150}),
        };
        const evaluations: {[key: number]: EvaluationRecord} = {
            3: {id: 3, type: 'end_play', video_id: 3},
        };

        const result = CoursePage.prototype.mergeVideoInfo.call(ctx, videos, {}, evaluations);

        expect(result[0].history).toEqual({end_time: 150, played_at: null});
        expect(result[0].is_evaluated).toBe(true);
    });

    it('does not synthesize history from an evaluation when duration is unknown', () => {
        const ctx = {} as CoursePage;
        const videos: CourseMembers = {
            '4': lecture({id: 4}),
        };
        const evaluations: {[key: number]: EvaluationRecord} = {
            4: {id: 4, type: 'end_play', video_id: 4},
        };

        const result = CoursePage.prototype.mergeVideoInfo.call(ctx, videos, {}, evaluations);

        expect(result[0].history).toEqual({end_time: null, played_at: null});
    });

    it('is null when there is no play history at all', () => {
        const ctx = {} as CoursePage;
        CoursePage.prototype.mergeVideoInfo.call(ctx, {'1': lecture({id: 1})}, {}, {});

        expect(ctx.lastPlayedVideoKey).toBeNull();
    });
});

describe('CoursePage.filterVideos', () => {
    const videos: Lecture[] = [
        lecture({id: 1, title: 'Cardiology Basics', lecturer: 'Dr. Smith'}),
        lecture({id: 2, title: 'Neurology 101', lecturer: 'Dr. Jones'}),
        lecture({id: 3, title: 'Untitled Lecture', lecturer: null}),
    ];

    it('returns the same array when the query is empty or whitespace', () => {
        expect(CoursePage.prototype.filterVideos.call(null, videos, '')).toBe(videos);
        expect(CoursePage.prototype.filterVideos.call(null, videos, '   ')).toBe(videos);
    });

    it('matches by title case-insensitively', () => {
        const result = CoursePage.prototype.filterVideos.call(null, videos, 'neurology');
        expect(result.map(v => v.id)).toEqual([2]);
    });

    it('matches by lecturer case-insensitively', () => {
        const result = CoursePage.prototype.filterVideos.call(null, videos, 'smith');
        expect(result.map(v => v.id)).toEqual([1]);
    });

    it('does not throw when a video has no lecturer', () => {
        const result = CoursePage.prototype.filterVideos.call(null, videos, 'untitled');
        expect(result.map(v => v.id)).toEqual([3]);
    });
});

describe('CoursePage.getCurrentPlayTimeString', () => {
    const callGetCurrentPlayTimeString = (ctx: unknown) =>
        (CoursePage.prototype as unknown as {getCurrentPlayTimeString: () => string})
            .getCurrentPlayTimeString.call(ctx);

    it('formats the current media time as zero-padded HH:MM:SS', () => {
        const ctx = {media: {currentTime: 3725}};

        expect(callGetCurrentPlayTimeString(ctx)).toBe('01:02:05');
    });

    it('returns 00:00:00 when no media element is attached', () => {
        const ctx = {media: null};

        expect(callGetCurrentPlayTimeString(ctx)).toBe('00:00:00');
    });
});

describe('CoursePage.createMedia', () => {
    const callCreateMedia = (sources: Lecture['sources']) =>
        (CoursePage.prototype as unknown as {createMedia: (s: Lecture['sources']) => HTMLMediaElement})
            .createMedia.call(null, sources);

    it('creates a youtube-video element for YouTube sources', () => {
        const el = callCreateMedia([{type: 'video/youtube', src: 'https://youtu.be/abc', server: null}]);

        expect(el.tagName.toLowerCase()).toBe('youtube-video');
        expect(el.getAttribute('src')).toBe('https://youtu.be/abc');
        expect(el.hasAttribute('playsinline')).toBeTrue();
        expect(el.getAttribute('preload')).toBe('metadata');
    });

    it('creates an hlsjs-video element for HLS sources', () => {
        const el = callCreateMedia([{type: 'application/x-mpegURL', src: 'https://example.com/stream.m3u8', server: null}]);

        expect(el.tagName.toLowerCase()).toBe('hlsjs-video');
        expect(el.getAttribute('src')).toBe('https://example.com/stream.m3u8');
    });

    it('creates a dash-video element for DASH sources', () => {
        const el = callCreateMedia([{type: 'application/dash+xml; codecs="avc1.42E01E"', src: 'https://example.com/manifest.mpd', server: null}]);

        expect(el.tagName.toLowerCase()).toBe('dash-video');
        expect(el.getAttribute('src')).toBe('https://example.com/manifest.mpd');
    });

    it('creates a native video element with source children for progressive files', () => {
        const el = callCreateMedia([
            {type: 'video/mp4', src: 'https://example.com/video.mp4', server: null},
            {type: 'video/webm', src: 'https://example.com/video.webm', server: null},
        ]);

        expect(el.tagName.toLowerCase()).toBe('video');
        const sources = el.querySelectorAll('source');
        expect(sources.length).toBe(2);
        expect(sources[0].getAttribute('src')).toBe('https://example.com/video.mp4');
        expect(sources[0].getAttribute('type')).toBe('video/mp4');
        expect(sources[1].getAttribute('src')).toBe('https://example.com/video.webm');
        expect(sources[1].getAttribute('type')).toBe('video/webm');
    });
});

describe('CoursePage.detachMedia and attachMedia', () => {
    type MediaContext = {
        media: HTMLMediaElement | null;
        media$: BehaviorSubject<HTMLMediaElement | null>;
        mediaListeners: AbortController | null;
        videoSkinElement: {nativeElement: HTMLElement};
        currentVideo: Partial<Lecture>;
        expectVideoTimeJump: boolean;
        isEvaluated: boolean;
        createMedia: (sources: Lecture['sources']) => HTMLMediaElement;
        detachMedia: () => void;
        attachMedia: (sources: Lecture['sources']) => void;
        updatePlayRecord: jasmine.Spy;
        openEvaluationModal: jasmine.Spy;
        logMediaNotSupported: jasmine.Spy;
    };

    function createMediaContext(): MediaContext {
        const proto = CoursePage.prototype as unknown as MediaContext;
        return {
            media: null,
            media$: new BehaviorSubject<HTMLMediaElement | null>(null),
            mediaListeners: null,
            videoSkinElement: {nativeElement: document.createElement('div')},
            currentVideo: {id: 1, duration: 100, history: {end_time: 40, played_at: null, video_id: 1}},
            expectVideoTimeJump: true,
            isEvaluated: false,
            createMedia: proto.createMedia,
            detachMedia: proto.detachMedia,
            attachMedia: proto.attachMedia,
            updatePlayRecord: jasmine.createSpy('updatePlayRecord'),
            openEvaluationModal: jasmine.createSpy('openEvaluationModal'),
            logMediaNotSupported: jasmine.createSpy('logMediaNotSupported'),
        };
    }

    it('detaches existing media, aborts listeners, and resets media$ to null', () => {
        const ctx = createMediaContext();
        ctx.attachMedia([{type: 'video/mp4', src: 'https://example.com/a.mp4', server: null}]);

        const attachedMedia = ctx.media!;
        const abortSpy = spyOn(ctx.mediaListeners!, 'abort').and.callThrough();
        const pauseSpy = spyOn(attachedMedia, 'pause');

        ctx.detachMedia();

        expect(abortSpy).toHaveBeenCalled();
        expect(pauseSpy).toHaveBeenCalled();
        expect(ctx.media).toBeNull();
        expect(ctx.media$.value).toBeNull();
        expect(ctx.videoSkinElement.nativeElement.children.length).toBe(0);
    });

    it('does not attach a media element when sources are empty', () => {
        const ctx = createMediaContext();

        ctx.attachMedia([]);

        expect(ctx.media).toBeNull();
        expect(ctx.media$.value).toBeNull();
        expect(ctx.videoSkinElement.nativeElement.children.length).toBe(0);
    });

    it('seeks to history.end_time on loadedmetadata when expectVideoTimeJump is true', () => {
        const ctx = createMediaContext();
        ctx.attachMedia([{type: 'video/mp4', src: 'https://example.com/a.mp4', server: null}]);

        let seekedTime = 0;
        Object.defineProperty(ctx.media!, 'currentTime', {
            get: () => seekedTime,
            set: (v: number) => {
                seekedTime = v;
            },
            configurable: true,
        });

        ctx.media!.dispatchEvent(new Event('loadedmetadata'));

        expect(seekedTime).toBe(40);
        expect(ctx.expectVideoTimeJump).toBeFalse();
    });
});

describe('CoursePage.preventMouseEvent', () => {
    it('prevents the default action when a downloadable source exists', () => {
        const ctx = {currentVideo: {sources: [{path: 'lecture.mp4'}]}};
        const event = jasmine.createSpyObj('MouseEvent', ['preventDefault']);

        CoursePage.prototype.preventMouseEvent.call(ctx, event);

        expect(event.preventDefault).toHaveBeenCalled();
    });

    it('does nothing when there is no downloadable source', () => {
        const ctx = {currentVideo: {sources: [{path: 'lecture.m3u8'}]}};
        const event = jasmine.createSpyObj('MouseEvent', ['preventDefault']);

        CoursePage.prototype.preventMouseEvent.call(ctx, event);

        expect(event.preventDefault).not.toHaveBeenCalled();
    });

    it('does nothing when there is no current video', () => {
        const ctx = {currentVideo: null};
        const event = jasmine.createSpyObj('MouseEvent', ['preventDefault']);

        CoursePage.prototype.preventMouseEvent.call(ctx, event);

        expect(event.preventDefault).not.toHaveBeenCalled();
    });
});