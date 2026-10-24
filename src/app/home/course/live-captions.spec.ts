import videojs from 'video.js';
import type Player from 'video.js/dist/types/player';
import {canCaptionVideo, LiveCaptions, readResults, UserAgentData} from './live-captions';

class FakeRecognition {
    static instances: FakeRecognition[] = [];
    static availability = 'unavailable';
    static available = jasmine.createSpy('available').and.callFake(() => Promise.resolve(FakeRecognition.availability));
    static install = jasmine.createSpy('install').and.returnValue(Promise.resolve(true));

    lang = '';
    continuous = false;
    interimResults = false;
    processLocally = false;
    onresult: ((event: object) => void) | null = null;
    onerror: ((event: object) => void) | null = null;
    onend: (() => void) | null = null;
    track: MediaStreamTrack | undefined;
    aborted = false;

    constructor() {
        FakeRecognition.instances.push(this);
    }

    start(track?: MediaStreamTrack) {
        this.track = track;
    }

    abort() {
        this.aborted = true;
    }

    hear(...results: {transcript: string, isFinal?: boolean}[]) {
        const list = results.map(({transcript, isFinal}) => Object.assign([{transcript}], {isFinal: !!isFinal}));
        this.onresult({resultIndex: 0, results: list});
    }
}

function results(...items: {transcript: string, isFinal?: boolean}[]): SpeechRecognitionResultList {
    return items.map(({transcript, isFinal}) => Object.assign([{transcript}], {isFinal: !!isFinal})) as unknown as SpeechRecognitionResultList;
}

const chrome: UserAgentData = {brands: [{brand: 'Chromium', version: '141'}, {brand: 'Google Chrome', version: '141'}], mobile: false, platform: 'macOS'};

type SpeechScope = {SpeechRecognition: unknown, webkitSpeechRecognition: unknown};

describe('canCaptionVideo', () => {
    const scope = window as unknown as SpeechScope;
    const saved = {SpeechRecognition: scope.SpeechRecognition, webkitSpeechRecognition: scope.webkitSpeechRecognition};

    beforeEach(() => scope.SpeechRecognition = FakeRecognition);

    afterEach(() => Object.assign(scope, saved));

    it('is true for Chrome 135 and later on a computer', () => {
        expect(canCaptionVideo(chrome)).toBe(true);
        expect(canCaptionVideo({...chrome, brands: [{brand: 'Chromium', version: '135'}]})).toBe(true);
    });

    it('is false where start() would listen to the microphone instead', () => {
        expect(canCaptionVideo({...chrome, brands: [{brand: 'Chromium', version: '134'}]})).toBe(false);
        expect(canCaptionVideo({...chrome, mobile: true})).toBe(false);
        expect(canCaptionVideo({...chrome, platform: 'Android'})).toBe(false);
        // Safari and Firefox have no userAgentData
        expect(canCaptionVideo(null)).toBe(false);
    });

    it('is false without speech recognition', () => {
        scope.SpeechRecognition = undefined;
        scope.webkitSpeechRecognition = undefined;

        expect(canCaptionVideo(chrome)).toBe(false);
    });
});

describe('readResults', () => {
    it('separates finished phrases from the words still being heard', () => {
        const list = results({transcript: 'เก่า', isFinal: true}, {transcript: ' cardiac output', isFinal: true}, {transcript: ' เท่ากับ'}, {transcript: ' stroke volume'});

        expect(readResults(1, list)).toEqual({finished: ['cardiac output'], hearing: 'เท่ากับ stroke volume'});
    });

    it('writes Thai words together, keeping the spaces around English and numbers', () => {
        const list = results({transcript: 'หัว ใจ มี 4 ห้อง เรียก ว่า cardiac output นะ ครับ', isFinal: true});

        expect(readResults(0, list).finished).toEqual(['หัวใจมี 4 ห้องเรียกว่า cardiac output นะครับ']);
    });
});

describe('LiveCaptions', () => {
    let player: Player;
    let captions: LiveCaptions;
    let paused: boolean;
    let audio: AudioContext;
    let captureStream: jasmine.Spy;
    const saved = (window as unknown as {SpeechRecognition: unknown}).SpeechRecognition;
    const flush = () => new Promise(resolve => setTimeout(resolve));
    const box = () => player.el().querySelector('.vjs-live-captions');
    const button = () => player.el().querySelector('.vjs-live-captions-button') as HTMLElement;

    beforeEach(() => {
        localStorage.removeItem('liveCaptions');
        FakeRecognition.instances = [];
        FakeRecognition.availability = 'unavailable';
        FakeRecognition.available.calls.reset();
        FakeRecognition.install.calls.reset();
        (window as unknown as {SpeechRecognition: unknown}).SpeechRecognition = FakeRecognition;

        const video = document.createElement('video');
        document.body.append(video);
        player = videojs(video);
        paused = true;
        spyOn(player, 'paused').and.callFake(() => paused);
        audio = new AudioContext();
        const element = player.tech(true).el() as HTMLMediaElement & {captureStream: () => MediaStream};
        captureStream = spyOn(element, 'captureStream').and.callFake(() => audio.createMediaStreamDestination().stream);
        captions = new LiveCaptions(player);
    });

    afterEach(async () => {
        captions.dispose();
        player.dispose();
        await audio.close();
        (window as unknown as {SpeechRecognition: unknown}).SpeechRecognition = saved;
        localStorage.removeItem('liveCaptions');
    });

    async function play() {
        paused = false;
        player.trigger('playing');
        await flush();
    }

    it('offers a captions button, off at first', () => {
        expect(button().getAttribute('aria-pressed')).toBe('false');
        expect(button().textContent).toContain('Turn live captions on');
    });

    it('listens to the video in Thai, not the microphone, once turned on', async () => {
        await play();
        expect(FakeRecognition.instances.length).toBe(0);

        button().click();
        await flush();

        const recognition = FakeRecognition.instances[0];
        expect(recognition.lang).toBe('th-TH');
        expect(recognition.continuous).toBe(true);
        expect(recognition.interimResults).toBe(true);
        expect(recognition.track.kind).toBe('audio');
        expect(button().getAttribute('aria-pressed')).toBe('true');
        expect(localStorage.getItem('liveCaptions')).toBe('on');
    });

    it('shows what is said, and nothing once turned off', async () => {
        localStorage.setItem('liveCaptions', 'on');
        captions.dispose();
        captions = new LiveCaptions(player);
        await play();
        const recognition = FakeRecognition.instances[0];

        recognition.hear({transcript: 'หัวใจมี', isFinal: true}, {transcript: ' 4 ห้อง'});
        expect(box().textContent).toBe('หัวใจมี 4 ห้อง');
        expect(box().classList).not.toContain('vjs-hidden');

        button().click();
        expect(recognition.aborted).toBe(true);
        expect(box().classList).toContain('vjs-hidden');
        expect(localStorage.getItem('liveCaptions')).toBeNull();
    });

    it('stops while paused and starts again on play', async () => {
        button().click();
        await play();
        const first = FakeRecognition.instances[0];

        paused = true;
        player.trigger('pause');
        expect(first.aborted).toBe(true);

        await play();
        expect(FakeRecognition.instances.length).toBe(2);
    });

    it('carries on when Chrome ends a session while the video plays', async () => {
        button().click();
        await play();
        spyOn(Date, 'now').and.returnValue(Date.now() + 60_000);

        FakeRecognition.instances[0].onend();
        await flush();
        await flush();

        expect(FakeRecognition.instances.length).toBe(2);
    });

    it('uses the recognizer on the device when Chrome has Thai', async () => {
        FakeRecognition.availability = 'available';
        button().click();
        await play();

        expect(FakeRecognition.instances[0].processLocally).toBe(true);
    });

    it('downloads Thai when turned on, using the online service meanwhile', async () => {
        FakeRecognition.availability = 'downloadable';
        await play();
        button().click();
        await flush();

        expect(FakeRecognition.install).toHaveBeenCalledWith({langs: ['th-TH'], processLocally: true});
        expect(FakeRecognition.instances[0].processLocally).toBe(false);
    });

    it('says so when it cannot hear a video from another site', async () => {
        captureStream.and.throwError(new DOMException('Cannot capture from element with cross-origin data', 'SecurityError'));
        button().click();
        await play();

        expect(FakeRecognition.instances.length).toBe(0);
        expect(box().textContent).toBe('Live captions cannot hear this video');
    });

    it('gives up for the video when the browser refuses', async () => {
        button().click();
        await play();
        const recognition = FakeRecognition.instances[0];

        recognition.onerror({error: 'not-allowed'});
        recognition.onend();
        await play();

        expect(FakeRecognition.instances.length).toBe(1);
        expect(box().textContent).toBe('This browser does not allow live captions');
    });
});
