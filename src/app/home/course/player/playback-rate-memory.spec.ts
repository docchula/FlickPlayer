import videojs from 'video.js';
import type Player from 'video.js/dist/types/player';
import {PLAYBACK_RATE_KEY, rememberPlaybackRate} from './playback-rate-memory';

describe('rememberPlaybackRate', () => {
    let host: HTMLElement;
    let player: Player;
    let media: HTMLVideoElement;
    let readyState: number;

    async function createPlayer() {
        host = document.createElement('div');
        document.body.appendChild(host);
        const video = document.createElement('video');
        host.appendChild(video);
        player = videojs(video);
        await new Promise<void>(resolve => player.ready(() => resolve()));
        media = player.tech(true).el() as HTMLVideoElement;
        readyState = HTMLMediaElement.HAVE_METADATA;
        spyOn(player, 'readyState').and.callFake(() => readyState);
        rememberPlaybackRate(player);
    }

    // Sets the element's speed directly, as the browser does, and waits for video.js to report it
    function changeRate(rate: number) {
        return new Promise<void>(resolve => {
            player.one('ratechange', () => resolve());
            media.playbackRate = rate;
        });
    }

    beforeEach(() => localStorage.removeItem(PLAYBACK_RATE_KEY));

    afterEach(() => {
        player.dispose();
        host.remove();
        localStorage.removeItem(PLAYBACK_RATE_KEY);
    });

    it('saves the speed the student picks', async () => {
        await createPlayer();
        await changeRate(1.75);

        expect(localStorage.getItem(PLAYBACK_RATE_KEY)).toBe('1.75');
        expect(media.defaultPlaybackRate).toBe(1.75);
    });

    it('starts at the saved speed after a reload', async () => {
        localStorage.setItem(PLAYBACK_RATE_KEY, '2');
        await createPlayer();

        expect(media.playbackRate).toBe(2);
        expect(media.defaultPlaybackRate).toBe(2);
    });

    it('keeps the saved speed when the next video is loaded', async () => {
        localStorage.setItem(PLAYBACK_RATE_KEY, '2');
        await createPlayer();

        media.load(); // What switching lectures does to the element: speed goes back to its default
        expect(media.playbackRate).toBe(2);
    });

    it('ignores the reset while a new video loads and puts the saved speed back', async () => {
        localStorage.setItem(PLAYBACK_RATE_KEY, '1.5');
        await createPlayer();
        readyState = HTMLMediaElement.HAVE_NOTHING;
        media.defaultPlaybackRate = 1; // A tech that starts every source at 1x
        await changeRate(1);

        expect(localStorage.getItem(PLAYBACK_RATE_KEY)).toBe('1.5');

        readyState = HTMLMediaElement.HAVE_METADATA;
        player.trigger('loadedmetadata');
        await new Promise(resolve => player.one('ratechange', resolve));
        expect(player.playbackRate()).toBe(1.5);
    });

    it('starts at 1x when the saved value is unusable', async () => {
        localStorage.setItem(PLAYBACK_RATE_KEY, 'fast');
        await createPlayer();

        expect(media.playbackRate).toBe(1);
    });

    it('still works for the visit when storage is blocked', async () => {
        spyOn(Storage.prototype, 'getItem').and.throwError('SecurityError');
        spyOn(Storage.prototype, 'setItem').and.throwError('SecurityError');
        await createPlayer();
        await changeRate(1.25);

        media.load();
        expect(media.playbackRate).toBe(1.25);
    });
});
