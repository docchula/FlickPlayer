import type Player from 'video.js/dist/types/player';
import type Component from 'video.js/dist/types/component';
import {isGoogleChrome, liveCaptionComputer} from '../../../live-captions/live-captions';

export const SETUP_PAGE = '/live-captions';

interface PanelAction {
    label: string;
    run: () => unknown;
}

/**
 * A captions button in the control bar for Chrome's Live Caption, which writes captions for a
 * lecture in Thai and English.
 *
 * No page can flip Live Caption itself, but Chrome's picture-in-picture window has its own switch
 * for it. The button moves the video there, says where the switch is, and brings the video back
 * into the player, in full screen again if it was. Live Caption is a setting for the whole of
 * Chrome, so once it is on, the captions keep showing in the player.
 *
 * Only on Windows and Mac computers, where Chrome has Live Caption. In other browsers the button
 * says to use Chrome.
 */
export function addLiveCaptionControl(player: Player, computer = liveCaptionComputer(), chrome = isGoogleChrome()) {
    if (!computer) {
        return;
    }
    const panel = createPanel(player);
    let wasFullscreen = false;

    const setupSteps: PanelAction = {label: 'Setup steps', run: () => window.open(SETUP_PAGE, '_blank')};
    const close: PanelAction = {label: 'Close', run: () => panel.hide()};
    const backToPlayer: PanelAction = {
        label: 'Back to the player',
        run: async () => {
            panel.hide();
            try {
                if (player.isInPictureInPicture()) {
                    await player.exitPictureInPicture();
                }
                if (wasFullscreen && !player.isFullscreen()) {
                    await player.requestFullscreen();
                }
            } catch {
                // The video stays where it is
            }
        },
    };

    addButton(player, async () => {
        if (!chrome) {
            panel.show('Live captions come with Google Chrome. Open Flick in Chrome on this computer to turn them on.',
                [setupSteps, close]);
            return;
        }
        wasFullscreen = !!player.isFullscreen();
        try {
            await player.requestPictureInPicture();
        } catch {
            // A YouTube lecture, or none loaded yet
        }
        if (player.isInPictureInPicture()) {
            panel.show('In the small video window, click the captions button at the bottom right, then turn on Live Caption. '
                + 'Chrome keeps it on for every lecture.', [backToPlayer, setupSteps]);
        } else {
            panel.show('Chrome can\'t open its Live Caption switch here. Turn on Live Caption in Chrome\'s settings instead.',
                [setupSteps, close]);
        }
    });

    player.on('leavepictureinpicture', () => panel.hide());
    player.on('loadstart', () => {
        if (!player.isInPictureInPicture()) {
            panel.hide();
        }
    });
}

function addButton(player: Player, onClick: () => void) {
    const controlBar = player.getChild('controlBar');
    const next = controlBar.getChild('pictureInPictureToggle') ?? controlBar.getChild('fullscreenToggle');
    const index = next ? controlBar.children().indexOf(next) : undefined;
    const button = controlBar.addChild('button', {
        className: 'vjs-live-caption-control',
        controlText: 'Live captions',
        clickHandler: onClick,
    }, index) as Component;
    button.el().querySelector('.vjs-icon-placeholder')?.classList.add('vjs-icon-subtitles');
    return button;
}

// Inside the player rather than an alert, so it shows in full screen too
function createPanel(player: Player) {
    const el = document.createElement('div');
    el.className = 'vjs-live-caption-panel';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', 'Live captions');
    el.hidden = true;
    const message = document.createElement('p');
    const actions = document.createElement('div');
    actions.className = 'vjs-live-caption-actions';
    el.append(message, actions);
    player.el().appendChild(el);

    const hide = () => {
        el.hidden = true;
    };
    // Keys pressed here are for the panel's buttons, not the player's shortcuts
    el.addEventListener('keydown', event => {
        event.stopPropagation();
        if (event.key === 'Escape') {
            hide();
        }
    });

    return {
        hide,
        show(text: string, list: PanelAction[]) {
            message.textContent = text;
            actions.replaceChildren(...list.map(action => {
                const button = document.createElement('button');
                button.type = 'button';
                button.textContent = action.label;
                button.addEventListener('click', () => action.run());
                return button;
            }));
            el.hidden = false;
            actions.querySelector('button')?.focus();
        },
    };
}
