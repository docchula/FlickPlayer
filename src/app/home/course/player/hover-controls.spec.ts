import videojs from 'video.js';
import type Player from 'video.js/dist/types/player';
import {showControlsOnHover} from './hover-controls';

describe('showControlsOnHover', () => {
    // video.js hides the controls this long after the last activity
    const INACTIVITY_MS = 2000;

    let host: HTMLElement;
    let player: Player;

    function point(type: 'pointerenter' | 'pointerleave', pointerType = 'mouse') {
        player.el().dispatchEvent(new PointerEvent(type, {pointerType}));
    }

    beforeEach(() => {
        jasmine.clock().install();
        host = document.createElement('div');
        document.body.appendChild(host);
        const video = document.createElement('video');
        host.appendChild(video);
        player = videojs(video);
        jasmine.clock().tick(10); // Ready
        spyOn(player, 'paused').and.returnValue(false);
        spyOn(player, 'isFullscreen').and.returnValue(false);
        showControlsOnHover(player);
        player.trigger('play'); // video.js only starts tracking activity from the first play
    });

    afterEach(() => {
        player.dispose();
        host.remove();
        jasmine.clock().uninstall();
    });

    it('keeps the controls up while a resting mouse is over the player', () => {
        point('pointerenter');
        jasmine.clock().tick(INACTIVITY_MS * 3);

        expect(player.userActive()).toBeTrue();
        expect(player.hasClass('vjs-mouse-over')).toBeTrue();
    });

    it('hides the controls as soon as the mouse leaves a playing video', () => {
        point('pointerenter');
        jasmine.clock().tick(500);
        point('pointerleave');

        expect(player.userActive()).toBeFalse();
        expect(player.hasClass('vjs-mouse-over')).toBeFalse();
    });

    it('keeps the controls up when the mouse leaves a paused video', () => {
        (player.paused as jasmine.Spy).and.returnValue(true);
        point('pointerenter');
        point('pointerleave');

        expect(player.userActive()).toBeTrue();
    });

    it('lets the controls hide in fullscreen once the mouse rests', () => {
        (player.isFullscreen as jasmine.Spy).and.returnValue(true);
        point('pointerenter');
        jasmine.clock().tick(INACTIVITY_MS * 3);

        expect(player.userActive()).toBeFalse();
    });

    it('leaves touch as it was', () => {
        point('pointerenter', 'touch');
        jasmine.clock().tick(INACTIVITY_MS * 3);

        expect(player.userActive()).toBeFalse();
        expect(player.hasClass('vjs-mouse-over')).toBeFalse();
    });
});
