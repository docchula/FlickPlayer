import videojs from 'video.js';
import type Player from 'video.js/dist/types/player';
import {addLiveCaptionControl, SETUP_PAGE} from './live-caption-control';

describe('addLiveCaptionControl', () => {
    let host: HTMLElement;
    let player: Player;

    const settle = () => new Promise(resolve => setTimeout(resolve));
    const control = () => player.el().querySelector<HTMLElement>('.vjs-live-caption-control');
    const panel = () => player.el().querySelector<HTMLElement>('.vjs-live-caption-panel');
    const actions = () => Array.from(panel().querySelectorAll('button')).map(button => button.textContent);
    const action = (label: string) => Array.from(panel().querySelectorAll('button')).find(button => button.textContent === label);

    function pictureInPictureOpens() {
        spyOn(player, 'requestPictureInPicture').and.callFake(async () => {
            player.isInPictureInPicture(true);
        });
        spyOn(player, 'exitPictureInPicture').and.callFake(async () => {
            player.isInPictureInPicture(false);
            player.trigger('leavepictureinpicture');
        });
    }

    beforeEach(async () => {
        host = document.createElement('div');
        document.body.appendChild(host);
        const videoEl = document.createElement('video');
        host.appendChild(videoEl);
        player = videojs(videoEl, {controls: true, width: 640, height: 320});
        await new Promise<void>(resolve => player.ready(() => resolve()));
    });

    afterEach(() => {
        player.dispose();
        host.remove();
    });

    it('puts a captions button in the control bar, before picture-in-picture', () => {
        addLiveCaptionControl(player, 'macOS', true);

        expect(control().getAttribute('title')).toBe('Live captions');
        expect(control().querySelector('.vjs-icon-placeholder').classList).toContain('vjs-icon-subtitles');
        expect(control().nextElementSibling.classList).toContain('vjs-picture-in-picture-control');
        expect(panel().hidden).toBeTrue();
    });

    it('adds nothing on a phone or a tablet', () => {
        addLiveCaptionControl(player, null, true);

        expect(control()).toBeNull();
        expect(panel()).toBeNull();
    });

    it('in Chrome, opens picture-in-picture and says where its Live Caption switch is', async () => {
        addLiveCaptionControl(player, 'Windows', true);
        pictureInPictureOpens();

        control().click();
        await settle();

        expect(player.requestPictureInPicture).toHaveBeenCalled();
        expect(panel().hidden).toBeFalse();
        expect(panel().textContent).toContain('click the captions button at the bottom right, then turn on Live Caption');
        expect(actions()).toEqual(['Back to the player', 'Setup steps']);

        // Leaving picture-in-picture from Chrome's own window
        player.isInPictureInPicture(false);
        player.trigger('leavepictureinpicture');
        expect(panel().hidden).toBeTrue();
    });

    it('brings the video back into the player, in full screen again if it was', async () => {
        addLiveCaptionControl(player, 'macOS', true);
        pictureInPictureOpens();
        let fullscreen = true;
        spyOn(player, 'isFullscreen').and.callFake(() => fullscreen);
        spyOn(player, 'requestFullscreen').and.resolveTo();
        // Chrome leaves full screen when the video moves to picture-in-picture
        (player.requestPictureInPicture as jasmine.Spy).and.callFake(async () => {
            fullscreen = false;
            player.isInPictureInPicture(true);
        });

        control().click();
        await settle();
        action('Back to the player').click();
        await settle();

        expect(player.exitPictureInPicture).toHaveBeenCalled();
        expect(player.requestFullscreen).toHaveBeenCalled();
        expect(panel().hidden).toBeTrue();
    });

    it('stays out of full screen when the video was not in it', async () => {
        addLiveCaptionControl(player, 'macOS', true);
        pictureInPictureOpens();
        spyOn(player, 'requestFullscreen').and.resolveTo();

        control().click();
        await settle();
        action('Back to the player').click();
        await settle();

        expect(player.exitPictureInPicture).toHaveBeenCalled();
        expect(player.requestFullscreen).not.toHaveBeenCalled();
    });

    it('points to the setup steps when Chrome cannot open its switch', async () => {
        addLiveCaptionControl(player, 'macOS', true);
        spyOn(player, 'requestPictureInPicture').and.rejectWith(new DOMException('No video', 'InvalidStateError'));
        spyOn(window, 'open').and.returnValue(null);

        control().click();
        await settle();

        expect(panel().textContent).toContain('Turn on Live Caption in Chrome\'s settings instead');
        expect(actions()).toEqual(['Setup steps', 'Close']);
        action('Setup steps').click();
        expect(window.open).toHaveBeenCalledWith(SETUP_PAGE, '_blank');
        action('Close').click();
        expect(panel().hidden).toBeTrue();
    });

    it('in other browsers, says to use Chrome', async () => {
        addLiveCaptionControl(player, 'macOS', false);
        spyOn(player, 'requestPictureInPicture');

        control().click();
        await settle();

        expect(player.requestPictureInPicture).not.toHaveBeenCalled();
        expect(panel().textContent).toContain('Live captions come with Google Chrome');
        expect(actions()).toEqual(['Setup steps', 'Close']);
    });

    it('closes on Escape, and keeps keys pressed in it from the player\'s shortcuts', async () => {
        addLiveCaptionControl(player, 'macOS', false);
        const shortcut = jasmine.createSpy('shortcut');
        player.el().addEventListener('keydown', shortcut);

        control().click();
        await settle();
        action('Close').dispatchEvent(new KeyboardEvent('keydown', {key: ' ', bubbles: true}));
        expect(shortcut).not.toHaveBeenCalled();
        action('Close').dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true}));

        expect(panel().hidden).toBeTrue();
    });
});
