import type Player from 'video.js/dist/types/player';

export const SEEK_STEP_SECONDS = 10;
// Longest gap between the two taps, or clicks, of a double tap
export const DOUBLE_TAP_MS = 300;
// After a double tap, each further tap on the same side within this long seeks again, as on YouTube
export const SEEK_STREAK_MS = 800;
// How long a press on the right of the video lasts before playback speeds up to BOOST_RATE
export const HOLD_MS = 500;
export const BOOST_RATE = 2;

// Travel that makes a press a drag rather than a tap or a hold
const TAP_SLOP_PX = 10;
// Longest touch still counted as a tap
const TAP_MAX_MS = 250;
// How long the seek feedback stays up after the last seek
const FEEDBACK_MS = 700;

// The video is split into thirds: the left third rewinds, the right third goes forward and holds
// to speed up, and the middle keeps video.js's own behaviour (double click for fullscreen).
type Zone = 'rewind' | 'middle' | 'forward';

/**
 * YouTube-style gestures on the video itself.
 *
 * - Double tap or double click the left or right third to go back or forward 10 seconds. Each
 *   further tap on the same side, while the first double tap is still showing, adds 10 seconds more.
 * - Press and hold the right third of a playing video to watch at 2x until you let go.
 *
 * On touch, a single tap still shows and hides the controls straight away; a double tap leaves
 * them as they were. With a mouse, a single click on either side plays or pauses once it is clear
 * no second click is coming, so a double click seeks without pausing in between.
 */
export function enableSeekGestures(player: Player) {
    const playerEl = player.el() as HTMLElement;
    const feedback = {
        rewind: createSeekFeedback(playerEl, 'rewind'),
        forward: createSeekFeedback(playerEl, 'forward'),
    };
    createBoostIndicator(playerEl);

    let streak: { zone: Zone, time: number, seconds: number } | null = null;
    let feedbackTimer: number | null = null;
    // Touch: the first tap of a possible double tap, which video.js has already acted on
    let lastTap: { zone: Zone, time: number, wasActive: boolean } | null = null;
    let touchStart: { x: number, y: number, time: number } | null = null;
    // Mouse: a click on either side, held back in case a second click follows
    let pendingClick: { zone: Zone, timer: number } | null = null;
    let pointerDownAt: { x: number, y: number } | null = null;
    let suppressClick = false;
    // Press and hold on the right
    let hold: { pointerId: number, x: number, y: number, timer: number | null, savedRate: number | null } | null = null;

    const isOnVideo = (target: EventTarget | null) => {
        const tech = player.tech(true)?.el();
        return !!tech && target instanceof Node && tech.contains(target);
    };

    const zoneAt = (clientX: number): Zone => {
        const rect = playerEl.getBoundingClientRect();
        const fraction = (clientX - rect.left) / rect.width;
        return fraction < 1 / 3 ? 'rewind' : fraction > 2 / 3 ? 'forward' : 'middle';
    };

    const canSeek = () => Number.isFinite(player.duration()) && player.duration() > 0;

    const seek = (zone: Zone) => {
        const now = performance.now();
        const continuing = streak?.zone === zone && now - streak.time < SEEK_STREAK_MS;
        streak = {zone, time: now, seconds: (continuing ? streak.seconds : 0) + SEEK_STEP_SECONDS};

        const step = zone === 'rewind' ? -SEEK_STEP_SECONDS : SEEK_STEP_SECONDS;
        player.currentTime(Math.min(Math.max(player.currentTime() + step, 0), player.duration()));
        showFeedback(zone, streak.seconds);
    };

    const isStreaking = (zone: Zone) => streak?.zone === zone && performance.now() - streak.time < SEEK_STREAK_MS;

    const showFeedback = (zone: Zone, seconds: number) => {
        const shown = zone === 'rewind' ? feedback.rewind : feedback.forward;
        const other = zone === 'rewind' ? feedback.forward : feedback.rewind;
        other.el.classList.remove('vjs-seek-feedback-visible');
        shown.label.textContent = `${seconds} seconds`;
        shown.el.classList.add('vjs-seek-feedback-visible');
        if (feedbackTimer !== null) {
            player.clearTimeout(feedbackTimer);
        }
        feedbackTimer = player.setTimeout(() => {
            shown.el.classList.remove('vjs-seek-feedback-visible');
            feedbackTimer = null;
        }, FEEDBACK_MS);
    };

    const togglePlay = () => {
        // As video.js does for a click on the video
        if (!player.controls()) {
            return;
        }
        if (player.paused()) {
            player.play()?.catch(() => undefined);
        } else {
            player.pause();
        }
    };

    // Touch taps. Listen in the capture phase so a seeking tap can be kept from video.js, which
    // would otherwise toggle the controls on it.
    playerEl.addEventListener('touchstart', (event: TouchEvent) => {
        const touch = event.touches[0];
        touchStart = event.touches.length === 1 && isOnVideo(event.target)
            ? {x: touch.clientX, y: touch.clientY, time: performance.now()}
            : null;
    }, {capture: true, passive: true});

    playerEl.addEventListener('touchend', (event: TouchEvent) => {
        const start = touchStart;
        touchStart = null;
        const touch = event.changedTouches[0];
        if (!start || !touch || event.touches.length > 0 || !canSeek()
            || Math.hypot(touch.clientX - start.x, touch.clientY - start.y) > TAP_SLOP_PX
            || performance.now() - start.time > TAP_MAX_MS) {
            return; // Not a tap: a drag, a hold or more than one finger
        }

        const zone = zoneAt(touch.clientX);
        const now = performance.now();
        if (zone === 'middle') {
            lastTap = null;
            return;
        }
        if (isStreaking(zone)) {
            seek(zone);
        } else if (lastTap?.zone === zone && now - lastTap.time < DOUBLE_TAP_MS) {
            player.userActive(lastTap.wasActive); // Undo the first tap's toggle of the controls
            lastTap = null;
            seek(zone);
        } else {
            lastTap = {zone, time: now, wasActive: player.userActive()};
            return; // Let video.js toggle the controls
        }
        event.stopPropagation();
        if (event.cancelable) {
            event.preventDefault(); // No click, and no double-tap zoom
        }
    }, {capture: true});

    // Mouse clicks
    playerEl.addEventListener('click', (event: MouseEvent) => {
        if (suppressClick) {
            suppressClick = false; // The release that ends a hold is not a click
            event.stopPropagation();
            return;
        }
        if ((event as PointerEvent).pointerType === 'touch' || !isOnVideo(event.target) || !canSeek()) {
            return;
        }
        if (pointerDownAt && Math.hypot(event.clientX - pointerDownAt.x, event.clientY - pointerDownAt.y) > TAP_SLOP_PX) {
            return; // A drag
        }
        const zone = zoneAt(event.clientX);
        if (zone === 'middle') {
            return;
        }

        // Keep video.js from playing or pausing until it is clear this is a single click
        event.stopPropagation();
        if (pendingClick?.zone === zone || isStreaking(zone)) {
            cancelPendingClick();
            seek(zone);
            return;
        }
        if (pendingClick) {
            // A click on the other side; the earlier one was a single click after all
            cancelPendingClick();
            togglePlay();
        }
        pendingClick = {
            zone,
            timer: player.setTimeout(() => {
                pendingClick = null;
                togglePlay();
            }, DOUBLE_TAP_MS),
        };
    }, {capture: true});

    const cancelPendingClick = () => {
        if (pendingClick) {
            player.clearTimeout(pendingClick.timer);
            pendingClick = null;
        }
    };

    playerEl.addEventListener('dblclick', (event: MouseEvent) => {
        // A double click on either side seeks; in the middle it still toggles fullscreen
        if (isOnVideo(event.target) && zoneAt(event.clientX) !== 'middle') {
            event.stopPropagation();
        }
    }, {capture: true});

    // Press and hold on the right to speed up
    playerEl.addEventListener('pointerdown', (event: PointerEvent) => {
        suppressClick = false;
        pointerDownAt = {x: event.clientX, y: event.clientY};
        if (hold || !event.isPrimary || event.button !== 0 || !isOnVideo(event.target)
            || zoneAt(event.clientX) !== 'forward' || player.paused() || player.playbackRate() >= BOOST_RATE) {
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

function createSeekFeedback(playerEl: HTMLElement, zone: 'rewind' | 'forward') {
    const el = document.createElement('div');
    el.className = `vjs-seek-feedback vjs-seek-feedback-${zone}`;
    el.setAttribute('aria-hidden', 'true');
    const icon = document.createElement('span');
    icon.className = `vjs-seek-feedback-icon vjs-icon-${zone === 'rewind' ? 'replay' : 'forward'}-10`;
    const label = document.createElement('span');
    label.className = 'vjs-seek-feedback-label';
    el.append(icon, label);
    playerEl.appendChild(el);

    return {el, label};
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
