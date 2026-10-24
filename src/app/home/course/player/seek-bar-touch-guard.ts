import type Player from 'video.js/dist/types/player';

// The video.js SeekBar handlers wrapped by guardSeekBarTouches()
interface SeekBarPointerHandlers {
    handleMouseDown(event: Event): void;
    handleMouseMove(event: Event, mouseDown?: boolean): void;
    handleMouseUp(event: Event): void;
}

// The part of the video.js ProgressControl that guardSeekBarTouches() calls into
interface ProgressControlHandlers {
    handleMouseUp(event: Event): void;
}

// How far a touch has to travel before its direction decides what it is
export const DRAG_SLOP_PX = 10;

// iPadOS takes swipes that start on the bottom edge of the screen: going home, opening the app
// switcher and sliding along the edge to the previous app. Keep in step with the lift given to the
// fullscreen control bar in global.scss, which moves the seek bar out of this strip.
export const SYSTEM_GESTURE_EDGE_PX = 24;

type TouchPhase =
    | 'idle'
    | 'pending' // Landed on the seek bar; not yet known to be a drag
    | 'scrubbing' // Handed to video.js, which is seeking with it
    | 'ignored'; // Never seeks: a tap, a swipe, a system gesture or more than one finger

/**
 * Stop touches that were not meant for the seek bar from seeking (issue #64).
 *
 * On an iPad, the seek bar sits where a student's finger lands when they swipe up to leave Safari,
 * and video.js seeks the moment a touch lands on it. A touch now only seeks once it has moved
 * sideways, as a deliberate drag along the bar does. Taps, swipes up, swipes that start on the
 * bottom edge and multi-finger gestures are ignored, and a drag that iPadOS takes over midway
 * (touchcancel) is undone. Mouse and keyboard handling is unchanged.
 */
export function guardSeekBarTouches(player: Player) {
    const progressControlComponent = player.getChild('controlBar')?.getChild('progressControl');
    const progressControl = progressControlComponent as unknown as ProgressControlHandlers | undefined;
    const seekBar = progressControlComponent?.getChild('seekBar') as unknown as SeekBarPointerHandlers | undefined;
    if (!progressControl || !seekBar) {
        return;
    }

    const originalMouseDown = seekBar.handleMouseDown.bind(seekBar);
    const originalMouseMove = seekBar.handleMouseMove.bind(seekBar);
    const originalMouseUp = seekBar.handleMouseUp.bind(seekBar);

    let phase: TouchPhase = 'idle';
    let startEvent: Event | null = null;
    let origin: { id: number, x: number, y: number } | null = null;
    let timeBeforeScrub = 0;

    seekBar.handleMouseDown = (event: Event) => {
        if (!isTouchEvent(event)) {
            originalMouseDown(event);
            return;
        }
        // A touch on the bar itself arrives twice: from the SeekBar, then from the
        // ProgressControl it bubbles up to. Let the ProgressControl's copy through untouched, as it
        // attaches the document-level touchmove and touchend listeners that drive this guard.
        if (event === startEvent) {
            return;
        }
        startEvent = event;
        if (phase !== 'idle') {
            abandon(event); // A second finger joined the first, or the last touch never ended
        }

        const touch = event.changedTouches[0];
        origin = touch ? { id: touch.identifier, x: touch.clientX, y: touch.clientY } : null;
        phase = !origin || event.touches.length > 1 || startsOnBottomEdge(origin.y) ? 'ignored' : 'pending';
    };

    seekBar.handleMouseMove = (event: Event, mouseDown = false) => {
        if (!isTouchEvent(event)) {
            originalMouseMove(event, mouseDown);
            return;
        }
        if (phase !== 'pending' && phase !== 'scrubbing') {
            return;
        }
        if (event.touches.length > 1) {
            abandon(event); // A pinch, or the four-finger swipe that switches apps
            return;
        }
        if (phase === 'scrubbing') {
            originalMouseMove(event, mouseDown);
            return;
        }

        const touch = findTouch(event, origin.id);
        if (!touch) {
            return;
        }
        const dx = Math.abs(touch.clientX - origin.x);
        const dy = Math.abs(touch.clientY - origin.y);
        if (Math.max(dx, dy) < DRAG_SLOP_PX) {
            return; // Within the slop of a stationary touch
        }
        if (dy >= dx) {
            phase = 'ignored'; // Mostly vertical: a swipe up to leave the app, not a drag along the bar
            return;
        }

        // Hand over to video.js as if the drag started here. Set the phase first,
        // since originalMouseDown calls back into handleMouseMove.
        phase = 'scrubbing';
        timeBeforeScrub = player.currentTime();
        originalMouseDown(event);
    };

    seekBar.handleMouseUp = (event: Event) => {
        if (!isTouchEvent(event)) {
            originalMouseUp(event);
            return;
        }
        if (phase === 'idle') {
            return; // Already torn down by the other touchend listener
        }
        const wasScrubbing = phase === 'scrubbing';
        reset();
        if (wasScrubbing) {
            originalMouseUp(event);
        } else if (event.cancelable) {
            // video.js listens for touchstart passively, so nothing stops iOS from replaying this
            // touch as mousedown and mouseup, which would seek to where it landed after all.
            event.preventDefault();
        }
    };

    // iPadOS cancels the touch once it recognises a system gesture. Neither SeekBar nor
    // ProgressControl listens for touchcancel, so without this their document-level listeners stay
    // attached and the next touch anywhere on the page, back in Safari, seeks the video.
    const handleTouchCancel = (event: TouchEvent) => {
        if (phase !== 'idle') {
            abandon(event);
        }
    };
    document.addEventListener('touchcancel', handleTouchCancel);
    player.on('dispose', () => document.removeEventListener('touchcancel', handleTouchCancel));

    // Drop the current touch. A scrub in progress is ended and its seek undone, since the gesture
    // it belonged to was not meant for the seek bar.
    function abandon(event: Event) {
        const wasScrubbing = phase === 'scrubbing';
        reset();
        if (wasScrubbing) {
            originalMouseUp(event);
            player.currentTime(timeBeforeScrub);
        }
        // Removes the ProgressControl's document listeners. Its call back into
        // seekBar.handleMouseUp finds the phase idle and does nothing.
        progressControl.handleMouseUp(event);
    }

    function reset() {
        phase = 'idle';
        origin = null;
    }
}

function isTouchEvent(event: Event): event is TouchEvent {
    return !!event && event.type.startsWith('touch');
}

function findTouch(event: TouchEvent, id: number): Touch | null {
    for (const list of [event.changedTouches, event.touches]) {
        for (let i = 0; i < (list?.length ?? 0); i++) {
            if (list[i].identifier === id) {
                return list[i];
            }
        }
    }
    return null;
}

function startsOnBottomEdge(clientY: number) {
    const viewport = window.visualViewport;
    const viewportBottom = viewport ? viewport.offsetTop + viewport.height : window.innerHeight;
    return clientY >= viewportBottom - SYSTEM_GESTURE_EDGE_PX;
}
