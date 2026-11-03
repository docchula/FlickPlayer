import videojs from 'video.js';
import type Player from 'video.js/dist/types/player';
import {enableVideoZoom, MAX_ZOOM, ZOOM_LOCKED_KEY} from './video-zoom';

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

    function touches(type: string, points: { clientX: number, clientY: number }[], target: Element = video) {
        const list = points.map((point, i) => new Touch({identifier: i + 1, target, ...point}));
        const event = new TouchEvent(type, {
            touches: list, targetTouches: list, changedTouches: list, bubbles: true, cancelable: true,
        });
        target.dispatchEvent(event);
        return event;
    }

    function pointer(type: string, point: { clientX: number, clientY: number }) {
        video.dispatchEvent(new PointerEvent(type, {
            pointerId: 1, isPrimary: true, button: 0, pointerType: 'mouse', bubbles: true, cancelable: true, ...point,
        }));
    }

    function menuItem(label: string) {
        return Array.from(player.el().querySelectorAll<HTMLElement>('.vjs-zoom-control .vjs-menu-item'))
            .find(item => item.querySelector('.vjs-menu-item-text').textContent === label);
    }

    const note = () => player.el().querySelector('.vjs-zoom-level').textContent;

    async function createPlayer() {
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
    }

    beforeEach(() => localStorage.removeItem(ZOOM_LOCKED_KEY));

    afterEach(() => {
        player.dispose();
        host.remove();
        localStorage.removeItem(ZOOM_LOCKED_KEY);
    });

    describe('with the zoom lock off, as it starts', () => {
        beforeEach(createPlayer);

        it('puts a zoom menu before full screen, with Zoom to slide and the zoom lock switched off', () => {
            const control = player.el().querySelector('.vjs-zoom-control');
            expect(control.nextElementSibling.classList).toContain('vjs-fullscreen-control');
            expect(control.querySelector('button').getAttribute('title')).toBe('Zoom');

            expect(menuItem('Zoom to slide')).toBeDefined();
            expect(menuItem('Zoom lock').getAttribute('aria-checked')).toBe('false');
            expect(player.hasClass('vjs-zoom-unlocked')).toBeTrue();
        });

        it('zooms straight to the slide from the menu, and back', () => {
            menuItem('Zoom to slide').click();
            // The player is 2:1 and the video, without metadata, fills it: the slide is the right two thirds
            // of the width and the middle two thirds of the height, so it fills the width at 1.5x
            const {scale, x, y} = view();
            expect(scale).toBeCloseTo(1.5, 5);
            expect(x).toBeCloseTo(-50, 5);
            expect(y).toBeCloseTo(-25, 5);
            expect(note()).toBe('1.5×');

            menuItem('Reset zoom').click();
            expect(view().scale).toBe(1);
            expect(menuItem('Zoom to slide')).toBeDefined();
        });

        it('finds the slide in a 16:9 video letterboxed in a taller player', () => {
            const tech = video as HTMLVideoElement;
            spyOnProperty(tech, 'videoWidth').and.returnValue(1920);
            spyOnProperty(tech, 'videoHeight').and.returnValue(1080);
            player.dimensions(640, 400);
            rect = player.el().getBoundingClientRect();

            menuItem('Zoom to slide').click();

            const {scale, y} = view();
            expect(scale).toBeCloseTo(1.5, 5);
            // The slide's middle, halfway down the frame, stays halfway down the player
            expect((50 - y) / scale).toBeCloseTo(50, 5);
        });

        it('turns the zoom lock on from the menu, says so, and remembers it on the device', () => {
            menuItem('Zoom lock').click();

            expect(menuItem('Zoom lock').getAttribute('aria-checked')).toBe('true');
            expect(player.hasClass('vjs-zoom-unlocked')).toBeFalse();
            expect(note()).toBe('Zoom locked');
            expect(localStorage.getItem(ZOOM_LOCKED_KEY)).toBe('true');
            expect(wheel({deltaY: -20, ctrlKey: true, ...at(0.5, 0.5)}).defaultPrevented).toBeFalse();
            expect(view().scale).toBe(1);

            menuItem('Zoom lock').click();

            expect(menuItem('Zoom lock').getAttribute('aria-checked')).toBe('false');
            expect(note()).toBe('Pinch or Ctrl + scroll to zoom');
            expect(localStorage.getItem(ZOOM_LOCKED_KEY)).toBeNull();
            expect(wheel({deltaY: -20, ctrlKey: true, ...at(0.5, 0.5)}).defaultPrevented).toBeTrue();
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

        it('zooms on a pinch on videojs-mobile-ui\'s overlay, which covers the video on phones and tablets', () => {
            const overlay = document.createElement('div');
            overlay.className = 'vjs-touch-overlay';
            player.el().appendChild(overlay);

            touches('touchstart', [at(0.4, 0.5), at(0.6, 0.5)], overlay);
            const move = touches('touchmove', [at(0.3, 0.5), at(0.7, 0.5)], overlay);

            expect(move.defaultPrevented).toBeTrue();
            expect(view().scale).toBeCloseTo(2, 5);
        });

        it('pans with one finger once zoomed in, and leaves one-finger drags to the page otherwise', () => {
            touches('touchstart', [at(0.5, 0.5)]);
            expect(touches('touchmove', [at(0.3, 0.5)]).defaultPrevented).toBeFalse();
            touches('touchend', []);

            menuItem('Zoom to slide').click();
            const before = view();
            touches('touchstart', [at(0.5, 0.5)]);
            // The slide is at the right edge, so only a drag to the right moves the view
            const move = touches('touchmove', [at(0.6, 0.5)]);

            expect(move.defaultPrevented).toBeTrue();
            expect(view().x).toBeGreaterThan(before.x);
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

    it('still turns the zoom lock on when the browser blocks storage', async () => {
        spyOn(Storage.prototype, 'getItem').and.throwError('SecurityError');
        spyOn(Storage.prototype, 'setItem').and.throwError('SecurityError');
        await createPlayer();
        expect(menuItem('Zoom lock').getAttribute('aria-checked')).toBe('false');

        menuItem('Zoom lock').click();

        expect(player.hasClass('vjs-zoom-unlocked')).toBeFalse();
    });

    describe('with the zoom lock turned on before', () => {
        beforeEach(async () => {
            localStorage.setItem(ZOOM_LOCKED_KEY, 'true');
            await createPlayer();
        });

        it('starts with the lock on', () => {
            expect(menuItem('Zoom lock').getAttribute('aria-checked')).toBe('true');
            expect(player.hasClass('vjs-zoom-unlocked')).toBeFalse();
        });

        it('leaves pinches, Ctrl + wheel and + / - to the browser, without zooming the video', () => {
            expect(wheel({deltaY: -20, ctrlKey: true, ...at(0.5, 0.5)}).defaultPrevented).toBeFalse();
            touches('touchstart', [at(0.4, 0.5), at(0.6, 0.5)]);
            expect(touches('touchmove', [at(0.3, 0.5), at(0.7, 0.5)]).defaultPrevented).toBeFalse();
            touches('touchend', []);
            player.el().dispatchEvent(new KeyboardEvent('keydown', {key: '+', bubbles: true}));

            expect(view().scale).toBe(1);
            expect(player.hasClass('vjs-zoomed')).toBeFalse();
        });

        it('still zooms to the slide, and keeps it in place: scrolling and dragging over it move the page instead', () => {
            menuItem('Zoom to slide').click();
            const before = view();
            expect(before.scale).toBeCloseTo(1.5, 5);

            expect(wheel({deltaY: 40, ...at(0.5, 0.5)}).defaultPrevented).toBeFalse();
            touches('touchstart', [at(0.5, 0.5)]);
            expect(touches('touchmove', [at(0.6, 0.5)]).defaultPrevented).toBeFalse();
            touches('touchend', []);
            pointer('pointerdown', at(0.5, 0.5));
            pointer('pointermove', at(0.6, 0.5));
            pointer('pointerup', at(0.6, 0.5));

            expect(view()).toEqual(before);
        });
    });
});
