import videojs from 'video.js';
import type Player from 'video.js/dist/types/player';
import {DRAG_SLOP_PX, guardSeekBarTouches, SYSTEM_GESTURE_EDGE_PX} from './seek-bar-touch-guard';

describe('guardSeekBarTouches', () => {
    // video.js throttles the progress control's touchmove handler to one call per 30ms
    const THROTTLE_MS = 35;
    const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    let host: HTMLElement;
    let player: Player;
    let time: number;
    let progressControl: HTMLElement;
    let bar: DOMRect;
    let barY: number;

    function touchAt(x: number, y: number, target: Element = progressControl, identifier = 1) {
        return new Touch({identifier, target, clientX: x, clientY: y, pageX: x, pageY: y});
    }

    function fire(type: string, changed: Touch[], touches: Touch[] = changed, target: Element = progressControl) {
        const event = new TouchEvent(type, {
            touches: type === 'touchend' || type === 'touchcancel' ? [] : touches,
            targetTouches: type === 'touchend' || type === 'touchcancel' ? [] : touches,
            changedTouches: changed,
            bubbles: true,
            cancelable: true,
        });
        target.dispatchEvent(event);
        return event;
    }

    // Lands at `from` and moves through each point in turn, as far apart as the throttle needs
    async function drag(from: [number, number], ...points: [number, number][]) {
        fire('touchstart', [touchAt(...from)]);
        for (const point of points) {
            await sleep(THROTTLE_MS);
            fire('touchmove', [touchAt(...point)]);
        }
    }

    function timeAt(x: number) {
        return (x - bar.left) / bar.width * player.duration();
    }

    beforeEach(async () => {
        host = document.createElement('div');
        document.body.appendChild(host);
        const video = document.createElement('video');
        host.appendChild(video);
        player = videojs(video, {width: 640, height: 320});
        await new Promise<void>(resolve => player.ready(() => resolve()));

        player.duration(100);
        time = 30;
        spyOn(player, 'currentTime').and.callFake(((seconds?: number) => {
            if (seconds !== undefined) {
                time = seconds;
            }
            return time;
        }) as never);
        spyOn(player, 'paused').and.returnValue(false);
        spyOn(player, 'pause');
        spyOn(player, 'play');

        guardSeekBarTouches(player);
        const progressComponent = player.getChild('controlBar').getChild('progressControl');
        progressControl = progressComponent.el() as HTMLElement;
        bar = progressComponent.getChild('seekBar').el().getBoundingClientRect();
        barY = Math.min(bar.top, window.innerHeight - SYSTEM_GESTURE_EDGE_PX - 100);
    });

    afterEach(() => {
        player.dispose();
        host.remove();
    });

    it('seeks when a touch drags sideways along the bar', async () => {
        const x = bar.left + bar.width / 4;
        await drag([x, barY], [x + 40, barY + 4]);
        expect(time).toBeCloseTo(timeAt(x + 40), 0);

        await sleep(THROTTLE_MS);
        fire('touchmove', [touchAt(x + 90, barY + 6)]);
        expect(time).toBeCloseTo(timeAt(x + 90), 0);
        expect(player.scrubbing()).toBeTrue();

        fire('touchend', [touchAt(x + 90, barY + 6)]);
        expect(player.scrubbing()).toBeFalse();
        expect(player.play).toHaveBeenCalled();
    });

    it('ignores a swipe up that starts on the bar, as when leaving Safari for another app', async () => {
        const x = bar.left + bar.width / 2;
        await drag([x, barY], [x + 4, barY - 2 * DRAG_SLOP_PX], [x + 12, barY - 80]);
        fire('touchend', [touchAt(x + 12, barY - 80)]);

        expect(time).toBe(30);
        expect(player.pause).not.toHaveBeenCalled();
    });

    it('keeps a tap from being replayed as a mouse click, which would seek', () => {
        const x = bar.left + bar.width / 2;
        fire('touchstart', [touchAt(x, barY)]);
        const touchEnd = fire('touchend', [touchAt(x, barY)]);

        expect(touchEnd.defaultPrevented).toBeTrue();
        expect(time).toBe(30);
    });

    it('ignores a touch that starts on the bottom edge of the screen, even when it slides sideways', async () => {
        const x = bar.left + bar.width / 4;
        const edgeY = window.innerHeight - SYSTEM_GESTURE_EDGE_PX / 2;
        await drag([x, edgeY], [x + 60, edgeY], [x + 120, edgeY]);

        expect(time).toBe(30);
        expect(player.pause).not.toHaveBeenCalled();
    });

    it('undoes a drag that iPadOS takes over midway', async () => {
        const x = bar.left + bar.width / 4;
        await drag([x, barY], [x + 60, barY]);
        expect(time).not.toBe(30);

        fire('touchcancel', [touchAt(x + 60, barY)]);

        expect(time).toBe(30);
        expect(player.scrubbing()).toBeFalse();
        expect(player.play).toHaveBeenCalled();
    });

    it('stops following a cancelled touch, so later touches elsewhere on the page do not seek', async () => {
        const x = bar.left + bar.width / 2;
        fire('touchstart', [touchAt(x, barY)]);
        fire('touchcancel', [touchAt(x, barY)]);

        // Back in Safari, the student scrolls the lecture list beside the player
        const elsewhere = document.body;
        fire('touchstart', [touchAt(x, barY + 200, elsewhere)], undefined, elsewhere);
        await sleep(THROTTLE_MS);
        fire('touchmove', [touchAt(x + 150, barY + 200, elsewhere)], undefined, elsewhere);
        await sleep(THROTTLE_MS);
        fire('touchmove', [touchAt(x - 150, barY + 200, elsewhere)], undefined, elsewhere);

        expect(time).toBe(30);
        expect(player.pause).not.toHaveBeenCalled();
    });

    it('ignores gestures made with more than one finger', async () => {
        const x = bar.left + bar.width / 4;
        const first = touchAt(x, barY);
        fire('touchstart', [first]);
        await sleep(THROTTLE_MS);
        const moved = touchAt(x + 60, barY);
        const second = touchAt(x + 200, barY - 20, progressControl, 2);
        fire('touchmove', [moved], [moved, second]);
        await sleep(THROTTLE_MS);
        fire('touchmove', [touchAt(x + 120, barY)], [touchAt(x + 120, barY), second]);

        expect(time).toBe(30);
    });

    it('leaves seeking with a mouse as it was', () => {
        const x = bar.left + bar.width * 0.75;
        const seekBarEl = player.getChild('controlBar').getChild('progressControl').getChild('seekBar').el();
        seekBarEl.dispatchEvent(new MouseEvent('mousedown', {
            clientX: x, clientY: bar.top, button: 0, buttons: 1, bubbles: true, cancelable: true,
        }));
        document.dispatchEvent(new MouseEvent('mouseup', {clientX: x, clientY: bar.top, button: 0, bubbles: true}));

        expect(time).toBeCloseTo(timeAt(x), 0);
    });
});
