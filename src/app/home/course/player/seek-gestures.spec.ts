import videojs from 'video.js';
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

    function tap(x: number) {
        const touch = new Touch({identifier: 1, target: video, clientX: x, clientY: y, pageX: x, pageY: y});
        video.dispatchEvent(new TouchEvent('touchstart', {
            touches: [touch], targetTouches: [touch], changedTouches: [touch], bubbles: true, cancelable: true,
        }));
        const end = new TouchEvent('touchend', {changedTouches: [touch], bubbles: true, cancelable: true});
        video.dispatchEvent(end);
        return end;
    }

    function pointer(type: string, x: number, pointerType = 'mouse') {
        video.dispatchEvent(new PointerEvent(type, {
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

    describe('on touch', () => {
        it('goes forward 10 seconds on a double tap on the right, leaving the controls as they were', () => {
            player.userActive(false);
            tap(right);
            expect(player.userActive()).toBeTrue(); // video.js shows the controls on the first tap

            const secondTap = tap(right);

            expect(time).toBe(40);
            expect(player.userActive()).toBeFalse();
            expect(secondTap.defaultPrevented).toBeTrue();
        });

        it('keeps going back 10 seconds more with each further tap on the left', () => {
            tap(left);
            tap(left);
            tap(left);
            tap(left);

            expect(time).toBe(0);
            expect(player.el().querySelector('.vjs-seek-feedback-rewind').textContent).toContain('30 seconds');
        });

        it('only toggles the controls on a single tap', async () => {
            const before = player.userActive();
            tap(right);
            await sleep(DOUBLE_TAP_MS + 50);
            tap(right);

            expect(time).toBe(30);
            expect(player.userActive()).toBe(before);
        });

        it('does not seek on a double tap in the middle', () => {
            tap(middle);
            tap(middle);

            expect(time).toBe(30);
        });
    });

    describe('with a mouse', () => {
        it('goes back 10 seconds on a double click on the left without pausing or going fullscreen', async () => {
            doubleClick(left);
            await sleep(DOUBLE_TAP_MS + 50);

            expect(time).toBe(20);
            expect(player.pause).not.toHaveBeenCalled();
            expect(player.play).not.toHaveBeenCalled();
            expect(player.requestFullscreen).not.toHaveBeenCalled();
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
    });

    describe('press and hold', () => {
        it('plays at 2x while the right side is held, then goes back to the earlier speed', async () => {
            pointer('pointerdown', right, 'touch');
            await sleep(HOLD_MS + 50);

            expect(rate).toBe(BOOST_RATE);
            expect(player.hasClass('vjs-speed-boost')).toBeTrue();

            pointer('pointerup', right, 'touch');

            expect(rate).toBe(1.25);
            expect(player.hasClass('vjs-speed-boost')).toBeFalse();
        });

        it('does not pause when a held mouse button is released', async () => {
            pointer('pointerdown', right);
            await sleep(HOLD_MS + 50);
            pointer('pointerup', right);
            video.dispatchEvent(new MouseEvent('click', {clientX: right, clientY: y, bubbles: true, cancelable: true}));
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

        it('does nothing on the left, after moving, or while paused', async () => {
            pointer('pointerdown', left, 'touch');
            await sleep(HOLD_MS + 50);
            pointer('pointerup', left, 'touch');
            expect(rate).toBe(1.25);

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
        });
    });
});
