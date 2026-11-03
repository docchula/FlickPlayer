import videojs from 'video.js';
import type Component from 'video.js/dist/types/component';
import type Player from 'video.js/dist/types/player';
import {BOOST_RATE, DOUBLE_TAP_MS, enableSeekGestures, HOLD_MS} from './seek-gestures';

describe('enableSeekGestures', () => {
    const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    let host: HTMLElement;
    let player: Player;
    let video: HTMLElement;
    let time: number;
    let rate: number;
    let paused: boolean;
    let left: number;
    let middle: number;
    let right: number;
    let y: number;

    function pointer(type: string, x: number, pointerType = 'mouse', target: Element = video) {
        target.dispatchEvent(new PointerEvent(type, {
            pointerId: 1, isPrimary: true, button: 0, pointerType, clientX: x, clientY: y, bubbles: true, cancelable: true,
        }));
    }

    function click(x: number, detail = 1) {
        pointer('pointerdown', x);
        pointer('pointerup', x);
        video.dispatchEvent(new MouseEvent('click', {clientX: x, clientY: y, detail, bubbles: true, cancelable: true}));
    }

    function doubleClick(x: number) {
        click(x, 1);
        click(x, 2);
        video.dispatchEvent(new MouseEvent('dblclick', {clientX: x, clientY: y, detail: 2, bubbles: true, cancelable: true}));
    }

    beforeEach(async () => {
        host = document.createElement('div');
        document.body.appendChild(host);
        const videoEl = document.createElement('video');
        host.appendChild(videoEl);
        player = videojs(videoEl, {controls: true, width: 600, height: 300});
        await new Promise<void>(resolve => player.ready(() => resolve()));

        player.duration(100);
        time = 30;
        rate = 1.25;
        paused = false;
        spyOn(player, 'currentTime').and.callFake(((seconds?: number) => {
            if (seconds !== undefined) {
                time = seconds;
            }
            return time;
        }) as never);
        spyOn(player, 'playbackRate').and.callFake(((value?: number) => {
            if (value !== undefined) {
                rate = value;
            }
            return rate;
        }) as never);
        spyOn(player, 'paused').and.callFake(() => paused);
        spyOn(player, 'play').and.callFake((() => {
            paused = false;
        }) as never);
        spyOn(player, 'pause').and.callFake(() => {
            paused = true;
            return player;
        });
        spyOn(player, 'requestFullscreen').and.returnValue(Promise.resolve());

        spyOn(player as never, 'mobileUi').and.callThrough();
        enableSeekGestures(player);
        video = player.tech(true).el() as HTMLElement;
        const rect = player.el().getBoundingClientRect();
        left = rect.left + rect.width / 6;
        middle = rect.left + rect.width / 2;
        right = rect.left + rect.width * 5 / 6;
        y = rect.top + rect.height / 2;
    });

    afterEach(() => {
        player.dispose();
        host.remove();
    });

    it('leaves double tap on touch to videojs-mobile-ui, without its fullscreen on rotate', () => {
        expect((player as unknown as { mobileUi: jasmine.Spy }).mobileUi).toHaveBeenCalledWith({
            fullscreen: {disabled: true},
            touchControls: {seekSeconds: 10, tapTimeout: DOUBLE_TAP_MS},
        });
    });

    describe('with a mouse or trackpad', () => {
        it('goes forward 10 seconds on a double click on the right without pausing or going fullscreen', async () => {
            doubleClick(right);
            await sleep(DOUBLE_TAP_MS + 50);

            expect(time).toBe(40);
            expect(player.pause).not.toHaveBeenCalled();
            expect(player.play).not.toHaveBeenCalled();
            expect(player.requestFullscreen).not.toHaveBeenCalled();
        });

        it('keeps going back 10 seconds more with each further click on the left', () => {
            click(left);
            click(left, 2);
            click(left, 3);
            click(left, 4);

            expect(time).toBe(0);
            expect(player.el().querySelector('.vjs-seek-feedback-rewind').textContent).toContain('30 seconds');
        });

        it('pauses on a single click on either side once no second click follows', async () => {
            click(right);
            expect(player.pause).not.toHaveBeenCalled();

            await sleep(DOUBLE_TAP_MS + 50);
            expect(player.pause).toHaveBeenCalledTimes(1);
            expect(time).toBe(30);
        });

        it('leaves the middle as it was: a click pauses at once, a double click goes fullscreen', () => {
            click(middle);
            expect(player.pause).toHaveBeenCalledTimes(1);

            doubleClick(middle);
            expect(player.requestFullscreen).toHaveBeenCalled();
            expect(time).toBe(30);
        });

        it('only plays or pauses before the length of the video is known', () => {
            player.duration(NaN);
            doubleClick(right);

            expect(time).toBe(30);
            expect(player.pause).toHaveBeenCalledTimes(1);
            expect(player.play).toHaveBeenCalledTimes(1);
            expect(player.requestFullscreen).toHaveBeenCalled();
        });
    });

    describe('press and hold', () => {
        it('plays at 2x while held, then goes back to the earlier speed', async () => {
            pointer('pointerdown', left, 'touch');
            await sleep(HOLD_MS + 50);

            expect(rate).toBe(BOOST_RATE);
            expect(player.hasClass('vjs-speed-boost')).toBeTrue();

            pointer('pointerup', left, 'touch');

            expect(rate).toBe(1.25);
            expect(player.hasClass('vjs-speed-boost')).toBeFalse();
        });

        it('does not pause when a held mouse button is released', async () => {
            pointer('pointerdown', middle);
            await sleep(HOLD_MS + 50);
            pointer('pointerup', middle);
            video.dispatchEvent(new MouseEvent('click', {clientX: middle, clientY: y, bubbles: true, cancelable: true}));
            await sleep(DOUBLE_TAP_MS + 50);

            expect(rate).toBe(1.25);
            expect(player.pause).not.toHaveBeenCalled();
        });

        it('goes back to the earlier speed when the system takes the touch', async () => {
            pointer('pointerdown', right, 'touch');
            await sleep(HOLD_MS + 50);
            pointer('pointercancel', right, 'touch');

            expect(rate).toBe(1.25);
        });

        it('does nothing after moving, while paused, or on the control bar', async () => {
            pointer('pointerdown', right, 'touch');
            pointer('pointermove', right - 40, 'touch');
            await sleep(HOLD_MS + 50);
            pointer('pointerup', right - 40, 'touch');
            expect(rate).toBe(1.25);

            paused = true;
            pointer('pointerdown', right, 'touch');
            await sleep(HOLD_MS + 50);
            pointer('pointerup', right, 'touch');
            expect(rate).toBe(1.25);

            paused = false;
            const controlBar = player.getChild('ControlBar').el();
            pointer('pointerdown', middle, 'mouse', controlBar);
            await sleep(HOLD_MS + 50);
            pointer('pointerup', middle, 'mouse', controlBar);
            expect(rate).toBe(1.25);
        });
    });

    describe('with videojs-mobile-ui\'s overlay, as on a phone or tablet', () => {
        let overlay: Component;
        let overlayEl: Element;

        const finger = (id: number, x: number) => new Touch({identifier: id, target: overlayEl, clientX: x, clientY: y});

        function touch(type: string, touches: Touch[], changedTouches: Touch[]) {
            const event = new TouchEvent(type, {
                touches, targetTouches: touches, changedTouches, bubbles: true, cancelable: true,
            });
            overlayEl.dispatchEvent(event);
            return event;
        }

        function tap(x: number) {
            const one = finger(1, x);
            touch('touchstart', [one], [one]);
            touch('touchend', [], [one]);
        }

        beforeEach(() => {
            overlay = player.addChild('TouchOverlay', {seekSeconds: 10, tapTimeout: DOUBLE_TAP_MS});
            overlayEl = overlay.el();
        });

        it('goes forward 10 seconds on a double tap', async () => {
            tap(right);
            tap(right);
            await sleep(DOUBLE_TAP_MS + 50);

            expect(time).toBe(40);
        });

        it('does not seek when the two fingers of a pinch are lifted', async () => {
            const [a, b] = [finger(1, right - 40), finger(2, right + 40)];
            touch('touchstart', [a], [a]);
            touch('touchstart', [a, b], [b]);
            const [movedA, movedB] = [finger(1, right - 80), finger(2, right + 80)];
            touch('touchmove', [movedA, movedB], [movedA, movedB]);
            touch('touchend', [movedB], [movedA]);
            touch('touchend', [], [movedB]);
            await sleep(DOUBLE_TAP_MS + 50);

            expect(time).toBe(30);
            expect(overlay.hasClass('show-play-toggle')).toBeFalse();
        });

        it('takes neither a drag nor the end of a hold for 2x as a tap', async () => {
            const start = finger(1, middle);
            const moved = finger(1, middle + 40);
            touch('touchstart', [start], [start]);
            touch('touchmove', [moved], [moved]);
            touch('touchend', [], [moved]);
            expect(overlay.hasClass('show-play-toggle')).toBeFalse();

            pointer('pointerdown', middle, 'touch', overlayEl);
            touch('touchstart', [start], [start]);
            await sleep(HOLD_MS + 50);
            expect(rate).toBe(BOOST_RATE);
            pointer('pointerup', middle, 'touch', overlayEl);
            const end = touch('touchend', [], [start]);

            expect(rate).toBe(1.25);
            expect(overlay.hasClass('show-play-toggle')).toBeFalse();
            expect(end.defaultPrevented).toBeTrue(); // No click from the release either

            tap(middle);
            expect(overlay.hasClass('show-play-toggle')).toBeTrue();
        });
    });
});
