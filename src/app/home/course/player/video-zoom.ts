import type Player from 'video.js/dist/types/player';
import type Component from 'video.js/dist/types/component';

export const MAX_ZOOM = 4;
// The zoom the control bar button and the keyboard step towards
export const BUTTON_ZOOM = 2;
const KEY_ZOOM_STEP = 1.25;
// A pinch on a trackpad arrives as ctrl+wheel events whose deltaY is 100x the log of the scale
// change. A mouse wheel notch is much larger, so cap each event to keep one notch near 1.2x.
const WHEEL_ZOOM_PER_DELTA = 0.01;
const MAX_WHEEL_DELTA = 20;
// Travel that turns a mouse press into a drag
const DRAG_SLOP_PX = 4;
// How long the zoom level stays up after the last change
const LEVEL_MS = 800;

// The Safari-only event for trackpad and touch pinches
interface GestureEvent extends UIEvent {
    scale: number;
    clientX: number;
    clientY: number;
}

/**
 * Zoom into the video, to read the small print on a lecture slide.
 *
 * - iPad: pinch with two fingers. Once zoomed in, drag with one finger to move around.
 * - Trackpad (macOS, Windows): pinch, and scroll with two fingers to move around.
 * - Mouse: Ctrl/⌘ + wheel, and drag to move around.
 * - Everyone: the magnifier button in the control bar zooms to 2x and back, and + / - step the
 *   zoom while the player has focus.
 *
 * The zoom is kept as fractions of the player's size, so it holds through fullscreen, and resets
 * when another video is loaded.
 */
export function enableVideoZoom(player: Player) {
    const playerEl = player.el() as HTMLElement;
    // Translation as fractions of the player's size; transform-origin is the top left corner
    let scale = 1;
    let offsetX = 0;
    let offsetY = 0;

    const level = document.createElement('div');
    level.className = 'vjs-zoom-level';
    level.setAttribute('aria-hidden', 'true');
    playerEl.appendChild(level);
    let levelTimer: number | null = null;

    const button = addZoomButton(player, () => {
        if (scale > 1) {
            zoomTo(1, 0.5, 0.5, true);
        } else {
            zoomTo(BUTTON_ZOOM, 0.5, 0.5, true);
        }
    });

    const techEl = () => player.tech(true)?.el() as HTMLElement | undefined;
    const isOnVideo = (target: EventTarget | null) => {
        const tech = techEl();
        return !!tech && target instanceof Node && tech.contains(target);
    };

    // A point on the page as fractions of the player's width and height
    const toPlayer = (clientX: number, clientY: number) => {
        const rect = playerEl.getBoundingClientRect();
        return {u: (clientX - rect.left) / rect.width, v: (clientY - rect.top) / rect.height};
    };

    const render = (animate = false) => {
        const tech = techEl();
        if (!tech) {
            return;
        }
        player.toggleClass('vjs-zoom-animating', animate);
        tech.style.transformOrigin = scale > 1 ? '0 0' : '';
        tech.style.transform = scale > 1
            ? `translate(${offsetX * 100}%, ${offsetY * 100}%) scale(${scale})`
            : '';
        if (player.hasClass('vjs-zoomed') !== scale > 1) {
            player.toggleClass('vjs-zoomed', scale > 1);
            button.controlText(scale > 1 ? 'Reset zoom' : 'Zoom in');
        }
    };

    const showLevel = () => {
        level.textContent = `${scale.toFixed(1)}×`;
        level.classList.add('vjs-zoom-level-visible');
        if (levelTimer !== null) {
            player.clearTimeout(levelTimer);
        }
        levelTimer = player.setTimeout(() => {
            level.classList.remove('vjs-zoom-level-visible');
            levelTimer = null;
        }, LEVEL_MS);
    };

    // Keep the video covering the whole player
    const clampOffsets = () => {
        offsetX = Math.min(0, Math.max(1 - scale, offsetX));
        offsetY = Math.min(0, Math.max(1 - scale, offsetY));
    };

    // Zoom so the point (u, v) of the player stays where it is
    function zoomTo(newScale: number, u: number, v: number, animate = false) {
        newScale = Math.min(MAX_ZOOM, Math.max(1, newScale));
        if (newScale === scale) {
            return;
        }
        offsetX = u - (u - offsetX) * newScale / scale;
        offsetY = v - (v - offsetY) * newScale / scale;
        scale = newScale;
        clampOffsets();
        render(animate);
        showLevel();
    }

    // Move the view by a distance in pixels; returns false when already against the edge
    const panBy = (dx: number, dy: number) => {
        const rect = playerEl.getBoundingClientRect();
        const before = [offsetX, offsetY];
        offsetX += dx / rect.width;
        offsetY += dy / rect.height;
        clampOffsets();
        render();
        return offsetX !== before[0] || offsetY !== before[1];
    };

    const reset = () => {
        scale = 1;
        offsetX = 0;
        offsetY = 0;
        render();
    };
    player.on('loadstart', reset);

    // Touch: pinch to zoom, and drag with one finger to pan while zoomed in
    let touchCount = 0;
    let pinch: { distance: number, scale: number, u: number, v: number, offsetX: number, offsetY: number } | null = null;
    let touchPan: { id: number, x: number, y: number } | null = null;

    const startTouchGesture = (event: TouchEvent) => {
        pinch = null;
        touchPan = null;
        if (event.touches.length >= 2) {
            const [a, b] = [event.touches[0], event.touches[1]];
            const mid = toPlayer((a.clientX + b.clientX) / 2, (a.clientY + b.clientY) / 2);
            pinch = {
                distance: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
                scale, u: mid.u, v: mid.v, offsetX, offsetY,
            };
        } else if (event.touches.length === 1 && scale > 1) {
            const touch = event.touches[0];
            touchPan = {id: touch.identifier, x: touch.clientX, y: touch.clientY};
        }
    };

    playerEl.addEventListener('touchstart', (event: TouchEvent) => {
        touchCount = event.touches.length;
        if (isOnVideo(event.target) || pinch || touchPan) {
            startTouchGesture(event);
        }
    }, {passive: true});

    playerEl.addEventListener('touchmove', (event: TouchEvent) => {
        if (pinch && event.touches.length >= 2) {
            event.preventDefault(); // The page must not zoom or scroll as well
            const [a, b] = [event.touches[0], event.touches[1]];
            const mid = toPlayer((a.clientX + b.clientX) / 2, (a.clientY + b.clientY) / 2);
            const distance = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
            // Scale about where the fingers started and follow them as they move
            const newScale = Math.min(MAX_ZOOM, Math.max(1, pinch.scale * distance / pinch.distance));
            scale = newScale;
            offsetX = mid.u - (pinch.u - pinch.offsetX) * newScale / pinch.scale;
            offsetY = mid.v - (pinch.v - pinch.offsetY) * newScale / pinch.scale;
            clampOffsets();
            render();
            showLevel();
        } else if (touchPan && event.touches.length === 1) {
            const touch = event.touches[0];
            event.preventDefault();
            panBy(touch.clientX - touchPan.x, touch.clientY - touchPan.y);
            touchPan = {id: touch.identifier, x: touch.clientX, y: touch.clientY};
        }
    }, {passive: false});

    const endTouchGesture = (event: TouchEvent) => {
        touchCount = event.touches.length;
        if (!pinch && !touchPan) {
            return;
        }
        // Lifting one finger of a pinch carries on as a one-finger pan
        startTouchGesture(event);
    };
    playerEl.addEventListener('touchend', endTouchGesture);
    playerEl.addEventListener('touchcancel', endTouchGesture);

    // Safari pinches. On an iPad a touch pinch fires these too, and is handled by the touch
    // events above; they still have to be cancelled, or Safari zooms the page.
    let gesture: { scale: number } | null = null;
    playerEl.addEventListener('gesturestart', (event: Event) => {
        event.preventDefault();
        gesture = touchCount === 0 ? {scale} : null;
    });
    playerEl.addEventListener('gesturechange', (event: Event) => {
        event.preventDefault();
        if (gesture) {
            const {u, v} = pointOf(event as GestureEvent);
            zoomTo(gesture.scale * (event as GestureEvent).scale, u, v);
        }
    });
    playerEl.addEventListener('gestureend', (event: Event) => {
        event.preventDefault();
        gesture = null;
    });
    const pointOf = (event: GestureEvent) => Number.isFinite(event.clientX)
        ? toPlayer(event.clientX, event.clientY)
        : {u: 0.5, v: 0.5};

    // Wheel: a trackpad pinch or Ctrl/⌘ + wheel zooms; scrolling pans while zoomed in
    playerEl.addEventListener('wheel', (event: WheelEvent) => {
        if (!isOnVideo(event.target)) {
            return;
        }
        const unit = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16 : 1;
        if (event.ctrlKey || event.metaKey) {
            event.preventDefault(); // Not the browser's page zoom
            if (gesture) {
                return; // Safari already reports this pinch as a gesture
            }
            const delta = Math.min(MAX_WHEEL_DELTA, Math.max(-MAX_WHEEL_DELTA, event.deltaY * unit));
            const {u, v} = toPlayer(event.clientX, event.clientY);
            zoomTo(scale * Math.exp(-delta * WHEEL_ZOOM_PER_DELTA), u, v);
        } else if (scale > 1 && panBy(-event.deltaX * unit, -event.deltaY * unit)) {
            event.preventDefault(); // Against an edge, let the page scroll instead
        }
    }, {passive: false});

    // Mouse: drag to pan while zoomed in
    let mouseDrag: { x: number, y: number, moved: boolean } | null = null;
    let suppressClick = false;
    playerEl.addEventListener('pointerdown', (event: PointerEvent) => {
        suppressClick = false;
        if (event.pointerType === 'mouse' && event.button === 0 && scale > 1 && isOnVideo(event.target)) {
            mouseDrag = {x: event.clientX, y: event.clientY, moved: false};
        }
    });
    const handleMouseMove = (event: PointerEvent) => {
        if (!mouseDrag) {
            return;
        }
        if (!mouseDrag.moved && Math.hypot(event.clientX - mouseDrag.x, event.clientY - mouseDrag.y) < DRAG_SLOP_PX) {
            return;
        }
        mouseDrag.moved = true;
        player.addClass('vjs-zoom-dragging');
        panBy(event.clientX - mouseDrag.x, event.clientY - mouseDrag.y);
        mouseDrag.x = event.clientX;
        mouseDrag.y = event.clientY;
    };
    const handleMouseUp = () => {
        if (mouseDrag?.moved) {
            suppressClick = true; // The release would otherwise play or pause the video
            player.removeClass('vjs-zoom-dragging');
        }
        mouseDrag = null;
    };
    // On the window, as the mouse may be released outside the player
    window.addEventListener('pointermove', handleMouseMove);
    window.addEventListener('pointerup', handleMouseUp);
    player.on('dispose', () => {
        window.removeEventListener('pointermove', handleMouseMove);
        window.removeEventListener('pointerup', handleMouseUp);
    });
    playerEl.addEventListener('click', (event: MouseEvent) => {
        if (suppressClick) {
            suppressClick = false;
            event.stopPropagation();
        }
    }, {capture: true});

    // Keyboard, while the player has focus
    playerEl.addEventListener('keydown', (event: KeyboardEvent) => {
        if (event.ctrlKey || event.metaKey || event.altKey) {
            return;
        }
        if (event.key === '+' || event.key === '=') {
            zoomTo(scale * KEY_ZOOM_STEP, 0.5, 0.5, true);
        } else if (event.key === '-') {
            zoomTo(scale / KEY_ZOOM_STEP, 0.5, 0.5, true);
        }
    });
}

function addZoomButton(player: Player, onClick: () => void) {
    const controlBar = player.getChild('controlBar');
    const fullscreenToggle = controlBar.getChild('fullscreenToggle');
    const index = fullscreenToggle ? controlBar.children().indexOf(fullscreenToggle) : undefined;
    const button = controlBar.addChild('button', {
        className: 'vjs-zoom-control',
        controlText: 'Zoom in',
        clickHandler: onClick,
    }, index) as Component & { controlText(text?: string): string };

    // A magnifier; the vertical stroke of the plus is hidden while zoomed in, leaving a minus
    button.el().querySelector('.vjs-icon-placeholder')?.insertAdjacentHTML('beforeend', `
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" stroke-width="2"/>
            <path d="M15.5 15.5 21 21" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>
            <path d="M7.5 10.5h6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            <path class="vjs-zoom-control-plus" d="M10.5 7.5v6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>`);

    return button;
}
