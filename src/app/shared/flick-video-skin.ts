import '@videojs/html/video/skin';
import '@videojs/html/ui/playback-rate-button';
import {VideoSkinElement} from '@videojs/html/video';

/**
 * The default `<video-skin>` with a playback rate button next to the settings button, so the speed can be changed
 * without opening the settings menu first. Markup follows the default audio skin's playback rate button.
 */
const PLAYBACK_RATE_CONTROLS = `
<media-playback-rate-button commandfor="flick-playback-rate-popup" class="media-button media-playback-rate-button video-controls-playback-rate-button" id="flick-playback-rate-trigger">
</media-playback-rate-button>
<media-tooltip trigger="flick-playback-rate-trigger" side="top" class="media-popup media-popup-safe-area media-popup-transition media-popup-surface media-tooltip">
<media-tooltip-label>
</media-tooltip-label>
<media-tooltip-shortcut class="media-tooltip-shortcut">
</media-tooltip-shortcut>
</media-tooltip>
<media-menu side="top" align="center" class="media-popup media-popup-surface media-menu-popup video-playback-rate-menu-popup" id="flick-playback-rate-popup">
<media-menu-content class="media-menu-content">
<media-playback-rate-radio-group class="media-menu-radio-group">
<template>
<media-menu-radio-item class="media-menu-radio-item">
<span data-part="label">
</span>
<media-menu-item-indicator force-mount class="media-menu-item-indicator">
<media-icon name="check" class="media-menu-radio-item-icon">
</media-icon>
</media-menu-item-indicator>
</media-menu-radio-item>
</template>
</media-playback-rate-radio-group>
</media-menu-content>
</media-menu>`;

// The video skin's stylesheet has no rules for the playback rate button, so these are taken from the audio skin.
const PLAYBACK_RATE_STYLES = `
.media-playback-rate-button {
  font-variant-numeric: tabular-nums;
}

@supports not (text-fit: shrink) {
  .media-playback-rate-button {
    font-size: min(1em, calc(4em / (var(--media-playback-rate-length, 3) + 1)));
  }
}

.media-playback-rate-button::after {
  text-align: center;
  white-space: nowrap;
  content: attr(data-rate) "×";
  text-fit: shrink;
  width: 80%;
  min-width: 0;
}

.video-playback-rate-menu-popup {
  min-width: 0 !important;
}

@container media-root (width < 15rem) {
  .video-controls-playback-rate-button {
    display: none;
  }
}
`;

/**
 * video.js keeps the controls visible for as long as the media is paused, but its idle tracking still runs: after the
 * idle delay `<media-controls>` drops `data-user-active` while keeping `data-visible`. Hide the controls in that state
 * so a paused frame can be viewed (or captured) without them, just like during playback. Any pointer, touch or key
 * activity sets `data-user-active` again and brings them back. The video title, which video.js shows alongside the
 * controls, is hidden with them. Controls stay up before the first play, after the media
 * has ended (for the replay button) and while a menu or other popup is open.
 */
const IDLE_CONTROLS = 'media-controls[data-started][data-visible]:not([data-user-active])';
const KEEP_CONTROLS = ':is([data-open]:not(media-tooltip), media-play-button[data-ended])';
const PAUSED_IDLE = `.media-skin:not(:has(${KEEP_CONTROLS})) ${IDLE_CONTROLS}`;
const PAUSED_IDLE_STYLES = `
${PAUSED_IDLE} :is(.video-controls-center, .video-controls-backdrop, .video-controls-content) {
  opacity: 0;
  pointer-events: none;
  transition: opacity var(--media-duration-controls, .3s);
}

${PAUSED_IDLE} :is(.video-controls-center, .video-controls-backdrop, .video-controls-content) * {
  pointer-events: none !important;
}

.media-skin:has(${IDLE_CONTROLS}):not(:has(${KEEP_CONTROLS})) .media-title {
  opacity: 0;
  transition: opacity var(--media-duration-controls, .3s);
}

@media (pointer: fine) {
  .media-skin:has(${IDLE_CONTROLS}):not(:has(${KEEP_CONTROLS})) {
    cursor: none;
  }
}
`;

function createTemplate(): HTMLTemplateElement {
    const template = VideoSkinElement.template!.cloneNode(true) as HTMLTemplateElement;
    const controls = document.createElement('template');
    controls.innerHTML = PLAYBACK_RATE_CONTROLS;
    template.content.querySelector('.video-controls-settings-button')!.before(controls.content);
    return template;
}

let playbackRateSheet: CSSStyleSheet | undefined;

interface ControlsStore {
    state: { toggleControls?: (forceShow?: boolean) => boolean };
}

export class FlickVideoSkinElement extends VideoSkinElement {
    static override template = createTemplate();

    constructor() {
        super();
        if (!playbackRateSheet) {
            playbackRateSheet = new CSSStyleSheet();
            playbackRateSheet.replaceSync(PLAYBACK_RATE_STYLES + PAUSED_IDLE_STYLES);
        }
        this.shadowRoot!.adoptedStyleSheets = [...this.shadowRoot!.adoptedStyleSheets, playbackRateSheet];

        // While paused, video.js treats the controls as visible, so its touch tap always hides them (again). When they
        // are hidden by PAUSED_IDLE_STYLES, take that tap over and show the controls instead. Listening on the shadow
        // root in the capture phase runs before the skin's own container listeners and gestures.
        let revealing = false;
        this.shadowRoot!.addEventListener('pointerdown', (event: Event) => {
            revealing = (event as PointerEvent).pointerType === 'touch' && this.#isPausedIdle() && this.#showControls();
            if (revealing) {
                event.stopPropagation();
            }
        }, {capture: true});
        // A pause that comes without user activity (e.g. from the app) should still show the controls for a moment.
        // 'pause' does not bubble, but the capture phase reaches this ancestor of the media element.
        this.addEventListener('pause', () => this.#showControls(), {capture: true});
        for (const type of ['pointerup', 'pointercancel'] as const) {
            this.shadowRoot!.addEventListener(type, (event) => {
                if (revealing && (event as PointerEvent).pointerType === 'touch') {
                    revealing = false;
                    event.stopPropagation();
                }
            }, {capture: true});
        }
    }

    #isPausedIdle(): boolean {
        return !!this.shadowRoot!.querySelector(PAUSED_IDLE);
    }

    #showControls(): boolean {
        const store = (this.closest('video-player') as (Element & { store?: ControlsStore }) | null)?.store;
        if (typeof store?.state.toggleControls !== 'function') {
            return false;
        }
        store.state.toggleControls(true);
        return true;
    }
}

if (!customElements.get('flick-video-skin')) {
    customElements.define('flick-video-skin', FlickVideoSkinElement);
}
