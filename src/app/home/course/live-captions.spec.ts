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
    /** What Chrome gives when the user shares this tab: its sound, and a picture that is not wanted. */
    let tab: MediaStream;
    let getDisplayMedia: jasmine.Spy;
    const saved = (window as unknown as {SpeechRecognition: unknown}).SpeechRecognition;
    const flush = () => new Promise(resolve => setTimeout(resolve));
    const box = () => player.el().querySelector('.vjs-live-captions');
    const button = () => player.el().querySelector('.vjs-live-captions-button') as HTMLElement;
    const alwaysAllow = () => button().parentElement.querySelector('.vjs-menu-item') as HTMLElement;
    const blockVideo = () => captureStream.and.throwError(new DOMException('Cannot capture from element with cross-origin data', 'SecurityError'));

    beforeEach(() => {
        localStorage.removeItem('liveCaptions');
        localStorage.removeItem('liveCaptionsAlwaysAllow');
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
        tab = new MediaStream([
            ...audio.createMediaStreamDestination().stream.getAudioTracks(),
            ...document.createElement('canvas').captureStream().getVideoTracks(),
        ]);
        getDisplayMedia = spyOn(navigator.mediaDevices, 'getDisplayMedia').and.callFake(() => Promise.resolve(tab));
        captions = new LiveCaptions(player);
    });

    afterEach(async () => {
        captions.dispose();
        tab.getTracks().forEach(track => track.stop());
        if (player.isFullWindow) {
            player.exitFullWindow();
        }
        player.dispose();
        await audio.close();
        (window as unknown as {SpeechRecognition: unknown}).SpeechRecognition = saved;
        localStorage.removeItem('liveCaptions');
        localStorage.removeItem('liveCaptionsAlwaysAllow');
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
        expect(getDisplayMedia).not.toHaveBeenCalled();
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

    describe('for a video from a server that does not let this site hear it', () => {
        const refuse = (name: string) => getDisplayMedia.and.callFake(() => Promise.reject(new DOMException('', name)));

        beforeEach(blockVideo);

        it('listens to this tab instead, once the user shares it', async () => {
            button().click();
            await play();

            expect(getDisplayMedia).toHaveBeenCalledOnceWith(jasmine.objectContaining({audio: true, preferCurrentTab: true}));
            expect(FakeRecognition.instances[0].track).toBe(tab.getAudioTracks()[0]);
            expect(tab.getVideoTracks()[0].readyState).toBe('ended');
        });

        it('keeps hearing the tab from one lecture to the next, and stops sharing it once turned off', async () => {
            button().click();
            await play();
            player.trigger('loadstart');
            await play();

            expect(getDisplayMedia).toHaveBeenCalledTimes(1);
            expect(FakeRecognition.instances.length).toBe(2);

            button().click();
            expect(tab.getAudioTracks()[0].readyState).toBe('ended');
        });

        it('waits for a click on CC when Chrome needs one before it asks', async () => {
            let asked = 0;
            getDisplayMedia.and.callFake(() => ++asked === 1 ? Promise.reject(new DOMException('', 'InvalidStateError')) : Promise.resolve(tab));
            localStorage.setItem('liveCaptions', 'on');
            captions.dispose();
            captions = new LiveCaptions(player);
            await play();

            expect(box().textContent).toBe('Click CC to let live captions hear this tab');
            expect(FakeRecognition.instances.length).toBe(0);

            button().click();
            await flush();

            expect(button().getAttribute('aria-pressed')).toBe('true');
            expect(FakeRecognition.instances[0].track).toBe(tab.getAudioTracks()[0]);
            expect(box().classList).toContain('vjs-hidden');
        });

        it('turns off when Chrome still will not ask after that click', async () => {
            refuse('InvalidStateError');
            button().click();
            await play();
            button().click();
            await flush();

            expect(button().getAttribute('aria-pressed')).toBe('false');
            expect(box().classList).toContain('vjs-hidden');
        });

        it('turns off when the tab is not shared', async () => {
            refuse('NotAllowedError');
            button().click();
            await play();

            expect(button().getAttribute('aria-pressed')).toBe('false');
            expect(localStorage.getItem('liveCaptions')).toBeNull();
            expect(box().textContent).toBe('Live captions need to hear this tab');
        });

        it('turns off when the tab is shared without its audio', async () => {
            getDisplayMedia.and.callFake(() => Promise.resolve(new MediaStream(tab.getVideoTracks())));
            button().click();
            await play();

            expect(FakeRecognition.instances.length).toBe(0);
            expect(tab.getVideoTracks()[0].readyState).toBe('ended');
            expect(button().getAttribute('aria-pressed')).toBe('false');
            expect(box().textContent).toBe('Live captions need the tab shared with its audio');
        });

        it('turns off when the user stops sharing the tab', async () => {
            button().click();
            await play();
            const recognition = FakeRecognition.instances[0];

            tab.getAudioTracks()[0].dispatchEvent(new Event('ended'));

            expect(recognition.aborted).toBe(true);
            expect(button().getAttribute('aria-pressed')).toBe('false');
        });

        it('says when a muted video leaves the tab nothing to hear', async () => {
            const muted = spyOn(player, 'muted').and.returnValue(true);
            button().click();
            await play();
            expect(box().textContent).toBe('Live captions cannot hear a muted video');

            muted.and.returnValue(false);
            player.trigger('volumechange');
            expect(box().classList).toContain('vjs-hidden');
        });

        it('says so when Chrome cannot share the tab either', async () => {
            refuse('NotFoundError');
            button().click();
            await play();

            expect(FakeRecognition.instances.length).toBe(0);
            expect(box().textContent).toBe('Live captions cannot hear this video');
        });
    });

    describe('with "Always allow"', () => {
        beforeEach(blockVideo);

        it('offers it in a menu on CC, off at first', () => {
            expect(alwaysAllow().textContent).toContain('Always allow');
            expect(alwaysAllow().getAttribute('role')).toBe('menuitemcheckbox');
            expect(alwaysAllow().getAttribute('aria-checked')).toBe('false');

            alwaysAllow().click();

            expect(alwaysAllow().getAttribute('aria-checked')).toBe('true');
            expect(localStorage.getItem('liveCaptionsAlwaysAllow')).toBe('on');
            expect(box().textContent).toBe('Chrome will ask to share this tab once each time Flick is opened');
        });

        it('keeps the tab shared when the captions are turned off, so turning them on does not ask again', async () => {
            alwaysAllow().click();
            button().click();
            await play();
            button().click();
            expect(tab.getAudioTracks()[0].readyState).toBe('live');

            button().click();
            await flush();

            expect(getDisplayMedia).toHaveBeenCalledTimes(1);
            expect(FakeRecognition.instances[1].track).toBe(tab.getAudioTracks()[0]);
        });

        it('keeps the tab shared for the next course page', async () => {
            alwaysAllow().click();
            button().click();
            await play();
            captions.dispose();
            expect(tab.getAudioTracks()[0].readyState).toBe('live');

            captions = new LiveCaptions(player);
            await play();

            expect(getDisplayMedia).toHaveBeenCalledTimes(1);
            expect(FakeRecognition.instances[1].track).toBe(tab.getAudioTracks()[0]);
        });

        it('stops sharing once it is turned off while the captions are off', async () => {
            alwaysAllow().click();
            button().click();
            await play();
            button().click();

            alwaysAllow().click();

            expect(tab.getAudioTracks()[0].readyState).toBe('ended');
        });
    });

    describe('fullscreen', () => {
        it('stays the browser\'s own while nothing is shared', async () => {
            button().click();
            await play();
            await player.requestFullscreen().catch(() => undefined);

            expect(player.isFullWindow).toBeFalsy();
        });

        it('fills the window instead while the tab is shared, as Chrome would squeeze it', async () => {
            blockVideo();
            button().click();
            await play();

            await player.requestFullscreen();
            expect(player.isFullWindow).toBeTrue();
            expect(player.isFullscreen()).toBeTrue();
            expect(document.fullscreenElement).toBeNull();

            await player.exitFullscreen();
            expect(player.isFullWindow).toBeFalse();
            expect(player.isFullscreen()).toBeFalse();
        });

        it('moves to filling the window when sharing starts in fullscreen', async () => {
            spyOnProperty(document, 'fullscreenElement').and.returnValue(player.el());
            const exit = spyOn(document, 'exitFullscreen').and.callFake(() => {
                document.dispatchEvent(new Event('fullscreenchange'));
                return Promise.resolve();
            });
            blockVideo();
            button().click();
            await play();
            await flush();

            expect(exit).toHaveBeenCalled();
            expect(player.isFullWindow).toBeTrue();
            expect(player.isFullscreen()).toBeTrue();
        });
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
