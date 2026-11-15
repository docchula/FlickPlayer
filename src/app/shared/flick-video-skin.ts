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

function createTemplate(): HTMLTemplateElement {
    const template = VideoSkinElement.template!.cloneNode(true) as HTMLTemplateElement;
    const controls = document.createElement('template');
    controls.innerHTML = PLAYBACK_RATE_CONTROLS;
    template.content.querySelector('.video-controls-settings-button')!.before(controls.content);
    return template;
}

let playbackRateSheet: CSSStyleSheet | undefined;

export class FlickVideoSkinElement extends VideoSkinElement {
    static override template = createTemplate();

    constructor() {
        super();
        if (!playbackRateSheet) {
            playbackRateSheet = new CSSStyleSheet();
            playbackRateSheet.replaceSync(PLAYBACK_RATE_STYLES);
        }
        this.shadowRoot!.adoptedStyleSheets = [...this.shadowRoot!.adoptedStyleSheets, playbackRateSheet];
    }
}

if (!customElements.get('flick-video-skin')) {
    customElements.define('flick-video-skin', FlickVideoSkinElement);
}
