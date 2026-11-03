import 'videojs-mobile-ui';
import type Player from 'video.js/dist/types/player';

export const SEEK_STEP_SECONDS = 10;
// Longest gap between the taps, or clicks, of a double tap
export const DOUBLE_TAP_MS = 300;
// How long a press on a playing video lasts before playback speeds up to BOOST_RATE
export const HOLD_MS = 500;
export const BOOST_RATE = 2;

// The left and right 40% of the video seek, as in videojs-mobile-ui; the middle goes fullscreen
const SIDE_FRACTION = 0.4;
// Travel that makes a press a drag rather than a tap or a hold
const TAP_SLOP_PX = 10;
// How long the seek feedback stays up after the last seek
const FEEDBACK_MS = 700;

type Side = 'rewind' | 'forward';

interface MobileUiPlayer {
    mobileUi(options: object): void;
}

// videojs-mobile-ui's overlay that takes the taps on phones and tablets
interface TouchOverlay {
    el(): Element;
    enable(): void;
    disable(): void;
}

/**
 * YouTube-style gestures on the video.
 *
 * - Phones and tablets: videojs-mobile-ui. Double tap the left or right of the video to go back or
 *   forward 10 seconds, and tap once for a large play/pause button.
 * - Mouse and trackpad (Windows, macOS): double click the left or right for the same. A single
 *   click there plays or pauses once it is clear no second click is coming; a double click in the
 *   middle still toggles fullscreen. videojs-mobile-ui only runs on Android and iOS, so this part
 *   is ours.
 * - Everyone: press and hold a playing video to watch at 2x until you let go.
 */
export function enableSeekGestures(player: Player) {
    (player as unknown as MobileUiPlayer).mobileUi({
        fullscreen: {disabled: true},
        touchControls: {seekSeconds: SEEK_STEP_SECONDS, tapTimeout: DOUBLE_TAP_MS},
    });

    const touchOverlay = () => player.getChild('TouchOverlay') as unknown as TouchOverlay | undefined;
    const isOnVideo = (target: EventTarget | null) => {
        const tech = player.tech(true)?.el();
        return target instanceof Node && (!!tech?.contains(target) || target === touchOverlay()?.el());
    };

    passOnlyTapsToOverlay(player, touchOverlay);
    enableDoubleClickSeek(player, touchOverlay);
    enableHoldToSpeedUp(player, isOnVideo);
}

// videojs-mobile-ui counts every touch that ends on its overlay as a tap, so lifting the two fingers
// of a pinch would seek, and a drag or a hold for 2x would bring up its play button. Hold its tap
// handler back for anything that is not a tap.
function passOnlyTapsToOverlay(player: Player, touchOverlay: () => TouchOverlay | undefined) {
    const playerEl = player.el() as HTMLElement;
    // Where and when the touch started, while it can still be a tap
    let tap: { x: number, y: number, time: number } | null = null;
    let heldBack: TouchOverlay | null = null;

    playerEl.addEventListener('touchstart', (event: TouchEvent) => {
        if (event.touches.length > 1) {
            tap = null; // A second finger: a pinch
            return;
        }
        heldBack?.enable();
        heldBack = null;
        const touch = event.touches[0];
        tap = {x: touch.clientX, y: touch.clientY, time: performance.now()};
    }, {capture: true, passive: true});

    playerEl.addEventListener('touchmove', (event: TouchEvent) => {
        const touch = event.touches[0];
        if (tap && touch && Math.hypot(touch.clientX - tap.x, touch.clientY - tap.y) > TAP_SLOP_PX) {
            tap = null;
        }
    }, {capture: true, passive: true});

    // In the capture phase, before the overlay's own touchend handler
    playerEl.addEventListener('touchend', (event: TouchEvent) => {
        const overlay = touchOverlay();
        if (!overlay || event.target !== overlay.el() || (tap && performance.now() - tap.time < HOLD_MS)) {
            return;
        }
        if (!heldBack) {
            overlay.disable();
            heldBack = overlay;
        }
        if (event.cancelable) {
            event.preventDefault(); // No click either, as the overlay would have done
        }
    }, {capture: true});
}

function enableDoubleClickSeek(player: Player, touchOverlay: () => TouchOverlay | undefined) {
    const showFeedback = createSeekFeedback(player);
    // The last click, so the next one on the same side soon after makes a double click
    let lastClick: { side: Side | null, time: number, seconds: number } | null = null;
    let pendingToggle: number | null = null;

    const sideAt = (clientX: number): Side | null => {
        const rect = player.el().getBoundingClientRect();
        const fraction = (clientX - rect.left) / rect.width;
        return fraction < SIDE_FRACTION ? 'rewind' : fraction > 1 - SIDE_FRACTION ? 'forward' : null;
    };
    const canSeek = () => Number.isFinite(player.duration()) && player.duration() > 0;

    const togglePlay = () => {
        if (player.paused()) {
            player.play()?.catch(() => undefined);
        } else {
            player.pause();
        }
    };
    const cancelPendingToggle = () => {
        if (pendingToggle !== null) {
            player.clearTimeout(pendingToggle);
            pendingToggle = null;
        }
    };

    const handleClick = (event: MouseEvent) => {
        const side = canSeek() ? sideAt(event.clientX) : null;
        const now = performance.now();
        if (side && lastClick?.side === side && now - lastClick.time < DOUBLE_TAP_MS) {
            // The second click of a double click, or a further one that seeks 10 seconds more
            cancelPendingToggle();
            lastClick = {side, time: now, seconds: lastClick.seconds + SEEK_STEP_SECONDS};
            const step = side === 'rewind' ? -SEEK_STEP_SECONDS : SEEK_STEP_SECONDS;
            player.currentTime(Math.min(Math.max(player.currentTime() + step, 0), player.duration()));
            showFeedback(side, lastClick.seconds);
            return;
        }
        if (pendingToggle !== null) {
            // A click elsewhere; the earlier one was a single click after all
            cancelPendingToggle();
            togglePlay();
        }
        lastClick = {side, time: now, seconds: 0};
        if (side) {
            pendingToggle = player.setTimeout(() => {
                pendingToggle = null;
                togglePlay();
            }, DOUBLE_TAP_MS);
        } else {
            togglePlay();
        }
    };

    const handleDoubleClick = (event: MouseEvent) => {
        if (canSeek() && sideAt(event.clientX)) {
            return; // Seeking, in handleClick
        }
        if (player.isFullscreen()) {
            player.exitFullscreen();
        } else {
            player.requestFullscreen();
        }
    };

    // video.js's own hooks for a click and a double click on the video
    player.options({userActions: {click: handleClick, doubleClick: handleDoubleClick}});

    // On an iPad with a trackpad or mouse, clicks land on videojs-mobile-ui's overlay instead
    player.on('click', (event: MouseEvent) => {
        if (player.controls() && event.target === touchOverlay()?.el()) {
            handleClick(event);
        }
    });
    player.on('dblclick', (event: MouseEvent) => {
        if (player.controls() && event.target === touchOverlay()?.el()) {
            handleDoubleClick(event);
        }
    });
}

function enableHoldToSpeedUp(player: Player, isOnVideo: (target: EventTarget | null) => boolean) {
    const playerEl = player.el() as HTMLElement;
    createBoostIndicator(playerEl);

    let hold: { pointerId: number, x: number, y: number, timer: number | null, savedRate: number | null } | null = null;
    let suppressClick = false;

    playerEl.addEventListener('pointerdown', (event: PointerEvent) => {
        suppressClick = false;
        if (hold || !event.isPrimary || event.button !== 0 || !isOnVideo(event.target)
            || player.paused() || player.playbackRate() >= BOOST_RATE) {
            return;
        }
        hold = {
            pointerId: event.pointerId,
            x: event.clientX,
            y: event.clientY,
            timer: player.setTimeout(startBoost, HOLD_MS),
            savedRate: null,
        };
    }, {capture: true});

    const startBoost = () => {
        hold.timer = null;
        if (player.paused() || player.playbackRate() >= BOOST_RATE) {
            hold = null;
            return;
        }
        hold.savedRate = player.playbackRate();
        player.addClass('vjs-speed-boost');
        player.playbackRate(BOOST_RATE);
    };

    const endHold = (event?: Event) => {
        if (!hold || (event instanceof PointerEvent && event.pointerId !== hold.pointerId)) {
            return;
        }
        if (hold.timer !== null) {
            player.clearTimeout(hold.timer);
        }
        if (hold.savedRate !== null) {
            player.removeClass('vjs-speed-boost');
            // Unless the speed was changed some other way meanwhile
            if (player.playbackRate() === BOOST_RATE) {
                player.playbackRate(hold.savedRate);
            }
            suppressClick = event?.type === 'pointerup';
        }
        hold = null;
    };

    // The release that ends a hold is not a click
    playerEl.addEventListener('click', (event: MouseEvent) => {
        if (suppressClick) {
            suppressClick = false;
            event.stopPropagation();
        }
    }, {capture: true});

    // Moving before the hold kicks in makes it a drag, a scroll or a pan, not a hold
    const handlePointerMove = (event: PointerEvent) => {
        if (hold && hold.timer !== null && hold.pointerId === event.pointerId
            && Math.hypot(event.clientX - hold.x, event.clientY - hold.y) > TAP_SLOP_PX) {
            endHold();
        }
    };
    // Listen on the window, as the pointer may be released outside the player
    window.addEventListener('pointermove', handlePointerMove, true);
    window.addEventListener('pointerup', endHold, true);
    window.addEventListener('pointercancel', endHold, true);
    window.addEventListener('blur', endHold);
    const handleVisibilityChange = () => endHold();
    document.addEventListener('visibilitychange', handleVisibilityChange);
    player.on('dispose', () => {
        window.removeEventListener('pointermove', handlePointerMove, true);
        window.removeEventListener('pointerup', endHold, true);
        window.removeEventListener('pointercancel', endHold, true);
        window.removeEventListener('blur', endHold);
        document.removeEventListener('visibilitychange', handleVisibilityChange);
    });

    // A long press on touch opens the context menu on some browsers
    playerEl.addEventListener('contextmenu', (event: Event) => {
        if (hold) {
            event.preventDefault();
        }
    }, {capture: true});
}

function createSeekFeedback(player: Player) {
    const create = (side: Side) => {
        const el = document.createElement('div');
        el.className = `vjs-seek-feedback vjs-seek-feedback-${side}`;
        el.setAttribute('aria-hidden', 'true');
        const icon = document.createElement('span');
        icon.className = `vjs-seek-feedback-icon vjs-icon-${side === 'rewind' ? 'replay' : 'forward'}-10`;
        const label = document.createElement('span');
        el.append(icon, label);
        player.el().appendChild(el);
        return {el, label};
    };
    const feedback = {rewind: create('rewind'), forward: create('forward')};
    let timer: number | null = null;

    return (side: Side, seconds: number) => {
        const shown = feedback[side];
        feedback[side === 'rewind' ? 'forward' : 'rewind'].el.classList.remove('vjs-seek-feedback-visible');
        shown.label.textContent = `${seconds} seconds`;
        shown.el.classList.add('vjs-seek-feedback-visible');
        if (timer !== null) {
            player.clearTimeout(timer);
        }
        timer = player.setTimeout(() => {
            shown.el.classList.remove('vjs-seek-feedback-visible');
            timer = null;
        }, FEEDBACK_MS);
    };
}

function createBoostIndicator(playerEl: HTMLElement) {
    const el = document.createElement('div');
    el.className = 'vjs-speed-boost-indicator';
    el.setAttribute('aria-hidden', 'true');
    const label = document.createElement('span');
    label.textContent = `${BOOST_RATE}×`;
    const icon = document.createElement('span');
    icon.className = 'vjs-speed-boost-icon vjs-icon-play';
    el.append(label, icon);
    playerEl.appendChild(el);
}
