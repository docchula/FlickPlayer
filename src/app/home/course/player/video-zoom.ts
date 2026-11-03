import videojs from 'video.js';
import type Player from 'video.js/dist/types/player';
import type MenuButton from 'video.js/dist/types/menu/menu-button';
import type MenuItem from 'video.js/dist/types/menu/menu-item';

export const MAX_ZOOM = 4;
// Where the slide sits in a lecture recording, as fractions of the frame: the lecturer and the
// faculty's seal take the left third, and the screen the rest, a 16:9 picture centred top to bottom
export const SLIDE = {left: 1 / 3, top: 1 / 6, width: 2 / 3, height: 2 / 3};
// localStorage key, set while a student has the Zoom switch on
export const ZOOM_ON_KEY = 'flickZoomOn';
const KEY_ZOOM_STEP = 1.25;
// A pinch on a trackpad arrives as ctrl+wheel events whose deltaY is 100x the log of the scale
// change. A mouse wheel notch is much larger, so cap each event to keep one notch near 1.2x.
const WHEEL_ZOOM_PER_DELTA = 0.01;
const MAX_WHEEL_DELTA = 20;
// Travel that turns a mouse press into a drag
const DRAG_SLOP_PX = 4;
// How long the zoom level stays up after the last change
const LEVEL_MS = 800;
// How long the note on turning the Zoom switch on or off stays up
const SWITCH_NOTE_MS = 2000;

// The Safari-only event for trackpad and touch pinches
interface GestureEvent extends UIEvent {
    scale: number;
    clientX: number;
    clientY: number;
}

/**
 * Zoom into the video, to read the small print on a lecture slide.
 *
 * The magnifier in the control bar opens a menu:
 * - Zoom to slide fills the player with the slide, and Reset zoom goes back.
 * - The Zoom switch, off until the student turns it on, lets pinches and Ctrl + scroll zoom the
 *   video, so a stray one can't. Turning it off leaves the view as it is, on the slide or in full
 *   screen. The choice is kept on the device.
 *
 * With the Zoom switch on:
 * - iPad: pinch with two fingers. Once zoomed in, drag with one finger to move around.
 * - Trackpad (macOS, Windows): pinch, and scroll with two fingers to move around.
 * - Mouse: Ctrl/⌘ + wheel, and drag to move around.
 * - Keyboard: + / - step the zoom while the player has focus.
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

    const menu = addZoomMenu(player);
    const slideItem = menu.addItem('Zoom to slide', () => {
        if (scale > 1) {
            zoomTo(1, 0.5, 0.5, true);
        } else {
            zoomToSlide();
        }
    });
    let zoomOn = loadZoomOn();
    player.toggleClass('vjs-zoom-on', zoomOn);
    const setSwitch = menu.addSwitch('Zoom', zoomOn, () => {
        zoomOn = !zoomOn;
        setSwitch(zoomOn);
        player.toggleClass('vjs-zoom-on', zoomOn);
        saveZoomOn(zoomOn);
        showNote(zoomOn ? 'Pinch or Ctrl + scroll to zoom' : 'Zoom off', SWITCH_NOTE_MS);
    });

    const techEl = () => player.tech(true)?.el() as HTMLElement | undefined;
    // On phones and tablets, touches on the video land on videojs-mobile-ui's overlay over it
    const isOnVideo = (target: EventTarget | null) => {
        const tech = techEl();
        return target instanceof Element && (!!tech?.contains(target) || target.classList.contains('vjs-touch-overlay'));
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
            menu.setLabel(slideItem, scale > 1 ? 'Reset zoom' : 'Zoom to slide');
        }
    };

    const showNote = (text: string, ms: number) => {
        level.textContent = text;
        level.classList.add('vjs-zoom-level-visible');
        if (levelTimer !== null) {
            player.clearTimeout(levelTimer);
        }
        levelTimer = player.setTimeout(() => {
            level.classList.remove('vjs-zoom-level-visible');
            levelTimer = null;
        }, ms);
    };
    const showLevel = () => showNote(`${scale.toFixed(1)}×`, LEVEL_MS);

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

    // Fill the player with the slide: the frame is letterboxed or pillarboxed when the player's
    // shape is not the video's, so the slide is found in the frame first
    function zoomToSlide() {
        const rect = playerEl.getBoundingClientRect();
        const tech = techEl() as HTMLVideoElement | undefined;
        const videoRatio = tech?.videoWidth && tech.videoHeight ? tech.videoWidth / tech.videoHeight : rect.width / rect.height;
        const playerRatio = rect.width / rect.height;
        const frame = videoRatio > playerRatio
            ? {width: 1, height: playerRatio / videoRatio}
            : {width: videoRatio / playerRatio, height: 1};
        const slide = {
            u: (1 - frame.width) / 2 + frame.width * (SLIDE.left + SLIDE.width / 2),
            v: (1 - frame.height) / 2 + frame.height * (SLIDE.top + SLIDE.height / 2),
            width: frame.width * SLIDE.width,
            height: frame.height * SLIDE.height,
        };
        scale = Math.min(MAX_ZOOM, 1 / slide.width, 1 / slide.height);
        offsetX = 0.5 - slide.u * scale;
        offsetY = 0.5 - slide.v * scale;
        clampOffsets();
        render(true);
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
        if (zoomOn && (isOnVideo(event.target) || pinch || touchPan)) {
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
        if (!zoomOn) {
            return;
        }
        event.preventDefault();
        gesture = touchCount === 0 ? {scale} : null;
    });
    playerEl.addEventListener('gesturechange', (event: Event) => {
        if (!zoomOn) {
            return;
        }
        event.preventDefault();
        if (gesture) {
            const {u, v} = pointOf(event as GestureEvent);
            zoomTo(gesture.scale * (event as GestureEvent).scale, u, v);
        }
    });
    playerEl.addEventListener('gestureend', (event: Event) => {
        if (!zoomOn) {
            return;
        }
        event.preventDefault();
        gesture = null;
    });
    const pointOf = (event: GestureEvent) => Number.isFinite(event.clientX)
        ? toPlayer(event.clientX, event.clientY)
        : {u: 0.5, v: 0.5};

    // Wheel: a trackpad pinch or Ctrl/⌘ + wheel zooms; scrolling pans while zoomed in
    playerEl.addEventListener('wheel', (event: WheelEvent) => {
        if (!zoomOn || !isOnVideo(event.target)) {
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
        if (zoomOn && event.pointerType === 'mouse' && event.button === 0 && scale > 1 && isOnVideo(event.target)) {
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
        if (!zoomOn || event.ctrlKey || event.metaKey || event.altKey) {
            return;
        }
        if (event.key === '+' || event.key === '=') {
            zoomTo(scale * KEY_ZOOM_STEP, 0.5, 0.5, true);
        } else if (event.key === '-') {
            zoomTo(scale / KEY_ZOOM_STEP, 0.5, 0.5, true);
        }
    });
}

function addZoomMenu(player: Player) {
    const controlBar = player.getChild('controlBar');
    const fullscreenToggle = controlBar.getChild('fullscreenToggle');
    const index = fullscreenToggle ? controlBar.children().indexOf(fullscreenToggle) : undefined;
    const menuButton = controlBar.addChild('MenuButton', {
        className: 'vjs-zoom-control',
        controlText: 'Zoom',
    }, index) as MenuButton;

    // A magnifier; the vertical stroke of the plus is hidden while zoomed in, leaving a minus
    menuButton.menuButton_.el().querySelector('.vjs-icon-placeholder')?.insertAdjacentHTML('beforeend', `
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" stroke-width="2"/>
            <path d="M15.5 15.5 21 21" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>
            <path d="M7.5 10.5h6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            <path class="vjs-zoom-control-plus" d="M10.5 7.5v6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>`);

    const MenuItemComponent = videojs.getComponent('MenuItem') as typeof MenuItem;
    const addItem = (label: string, run: () => void) => {
        const item = new MenuItemComponent(player, {label});
        item.on(['tap', 'click'], run);
        menuButton.menu.addItem(item);
        return item;
    };
    return {
        addItem,
        // An item with a switch after its label; returns a function that sets the switch
        addSwitch(label: string, on: boolean, run: () => void) {
            const item = addItem(label, run);
            item.el().setAttribute('role', 'menuitemcheckbox');
            item.el().insertAdjacentHTML('beforeend', '<span class="vjs-zoom-switch" aria-hidden="true"></span>');
            const set = (value: boolean) => {
                item.toggleClass('vjs-zoom-switch-on', value);
                item.el().setAttribute('aria-checked', String(value));
            };
            set(on);
            return set;
        },
        setLabel(item: MenuItem, label: string) {
            item.el().querySelector('.vjs-menu-item-text').textContent = label;
        },
    };
}

function loadZoomOn() {
    try {
        return localStorage.getItem(ZOOM_ON_KEY) === 'true';
    } catch {
        return false; // Storage blocked; the switch starts off
    }
}

function saveZoomOn(on: boolean) {
    try {
        if (on) {
            localStorage.setItem(ZOOM_ON_KEY, 'true');
        } else {
            localStorage.removeItem(ZOOM_ON_KEY);
        }
    } catch {
        // Storage blocked; the choice holds until the page is closed
    }
}
