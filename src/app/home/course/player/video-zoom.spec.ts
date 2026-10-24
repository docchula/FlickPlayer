import videojs from 'video.js';
import type Player from 'video.js/dist/types/player';
import {BUTTON_ZOOM, enableVideoZoom, MAX_ZOOM} from './video-zoom';

describe('enableVideoZoom', () => {
    let host: HTMLElement;
    let player: Player;
    let video: HTMLElement;
    let rect: DOMRect;

    // The video's zoom and translation, read back from its transform
    function view() {
        const transform = video.style.transform;
        if (!transform) {
            return {scale: 1, x: 0, y: 0};
        }
        const [, x, y, scale] = transform.match(/translate\(([-\d.e]+)%, ([-\d.e]+)%\) scale\(([\d.e]+)\)/).map(Number);
        return {scale, x, y};
    }

    function at(u: number, v: number) {
        return {clientX: rect.left + rect.width * u, clientY: rect.top + rect.height * v};
    }

    function wheel(init: WheelEventInit) {
        const event = new WheelEvent('wheel', {...init, bubbles: true, cancelable: true});
        video.dispatchEvent(event);
        return event;
    }

    function touches(type: string, points: { clientX: number, clientY: number }[]) {
        const list = points.map((point, i) => new Touch({identifier: i + 1, target: video, ...point}));
        const event = new TouchEvent(type, {
            touches: list, targetTouches: list, changedTouches: list, bubbles: true, cancelable: true,
        });
        video.dispatchEvent(event);
        return event;
    }

    function pointer(type: string, point: { clientX: number, clientY: number }) {
        video.dispatchEvent(new PointerEvent(type, {
            pointerId: 1, isPrimary: true, button: 0, pointerType: 'mouse', bubbles: true, cancelable: true, ...point,
        }));
    }

    beforeEach(async () => {
        host = document.createElement('div');
        document.body.appendChild(host);
        const videoEl = document.createElement('video');
        host.appendChild(videoEl);
        player = videojs(videoEl, {controls: true, width: 640, height: 320});
        await new Promise<void>(resolve => player.ready(() => resolve()));
        spyOn(player, 'paused').and.returnValue(false);
        spyOn(player, 'pause');

        enableVideoZoom(player);
        video = player.tech(true).el() as HTMLElement;
        rect = player.el().getBoundingClientRect();
    });

    afterEach(() => {
        player.dispose();
        host.remove();
    });

    it('zooms in around the pointer on a trackpad pinch or Ctrl + wheel, instead of zooming the page', () => {
        const event = wheel({deltaY: -20, ctrlKey: true, ...at(0.25, 0.25)});

        expect(event.defaultPrevented).toBeTrue();
        const {scale, x, y} = view();
        expect(scale).toBeGreaterThan(1.2);
        // The point under the pointer stays put: (0.25 - x) / scale is still 0.25 of the video
        expect((25 - x) / scale).toBeCloseTo(25, 2);
        expect((25 - y) / scale).toBeCloseTo(25, 2);
        expect(player.hasClass('vjs-zoomed')).toBeTrue();
    });

    it(`stops at ${MAX_ZOOM}x and keeps the video covering the player`, () => {
        for (let i = 0; i < 50; i++) {
            wheel({deltaY: -20, ctrlKey: true, ...at(1, 1)});
        }
        const {scale, x, y} = view();

        expect(scale).toBe(MAX_ZOOM);
        expect(x).toBeCloseTo((1 - MAX_ZOOM) * 100, 5);
        expect(y).toBeCloseTo((1 - MAX_ZOOM) * 100, 5);
    });

    it('lets plain scrolling scroll the page until zoomed in, then pans the video', () => {
        expect(wheel({deltaY: 40, ...at(0.5, 0.5)}).defaultPrevented).toBeFalse();

        wheel({deltaY: -40, ctrlKey: true, ...at(0.5, 0.5)});
        const before = view();
        expect(wheel({deltaY: 40, ...at(0.5, 0.5)}).defaultPrevented).toBeTrue();

        expect(view().y).toBeLessThan(before.y);
    });

    it('zooms on a two-finger pinch over the video', () => {
        touches('touchstart', [at(0.4, 0.5), at(0.6, 0.5)]);
        const move = touches('touchmove', [at(0.3, 0.5), at(0.7, 0.5)]);

        expect(move.defaultPrevented).toBeTrue();
        expect(view().scale).toBeCloseTo(2, 5);
    });

    it('pans with one finger once zoomed in, and leaves one-finger drags to the page otherwise', () => {
        touches('touchstart', [at(0.5, 0.5)]);
        expect(touches('touchmove', [at(0.3, 0.5)]).defaultPrevented).toBeFalse();
        touches('touchend', []);

        (player.el().querySelector('.vjs-zoom-control') as HTMLElement).click();
        const before = view();
        touches('touchstart', [at(0.5, 0.5)]);
        const move = touches('touchmove', [at(0.4, 0.5)]);

        expect(move.defaultPrevented).toBeTrue();
        expect(view().x).toBeLessThan(before.x);
    });

    it('pans on a mouse drag while zoomed in, without the release pausing the video', () => {
        wheel({deltaY: -40, ctrlKey: true, ...at(0.5, 0.5)});
        const before = view();
        pointer('pointerdown', at(0.5, 0.5));
        pointer('pointermove', at(0.4, 0.45));
        pointer('pointerup', at(0.4, 0.45));
        video.dispatchEvent(new MouseEvent('click', {bubbles: true, ...at(0.4, 0.45)}));

        expect(view().x).toBeLessThan(before.x);
        expect(player.pause).not.toHaveBeenCalled();
    });

    it(`zooms to ${BUTTON_ZOOM}x and back with the control bar button`, () => {
        const button = player.el().querySelector('.vjs-zoom-control') as HTMLElement;
        expect(button.nextElementSibling.classList).toContain('vjs-fullscreen-control');

        button.click();
        expect(view().scale).toBe(BUTTON_ZOOM);
        expect(button.textContent).toContain('Reset zoom');

        button.click();
        expect(view().scale).toBe(1);
        expect(button.textContent).toContain('Zoom in');
    });

    it('zooms on Safari trackpad pinches, but leaves touch pinches to the touch handler', () => {
        const gesture = (type: string, scale: number) => {
            const event = new UIEvent(type, {bubbles: true, cancelable: true});
            Object.assign(event, {scale, ...at(0.5, 0.5)});
            video.dispatchEvent(event);
            return event;
        };
        gesture('gesturestart', 1);
        expect(gesture('gesturechange', 1.5).defaultPrevented).toBeTrue();
        gesture('gestureend', 1.5);
        expect(view().scale).toBeCloseTo(1.5, 5);

        touches('touchstart', [at(0.4, 0.5), at(0.6, 0.5)]);
        gesture('gesturestart', 1);
        gesture('gesturechange', 3);
        expect(view().scale).toBeCloseTo(1.5, 5);
    });

    it('steps the zoom with + and - and resets when another video loads', () => {
        player.el().dispatchEvent(new KeyboardEvent('keydown', {key: '+', bubbles: true}));
        expect(view().scale).toBeGreaterThan(1);

        player.trigger('loadstart');
        expect(view().scale).toBe(1);
        expect(player.hasClass('vjs-zoomed')).toBeFalse();
    });
});
