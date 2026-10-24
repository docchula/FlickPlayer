import type Player from 'video.js/dist/types/player';

// Same interval video.js checks for user activity at
const KEEP_ACTIVE_MS = 250;

/**
 * Show the control bar, and with it the seek bar, for as long as a mouse is over the player.
 *
 * video.js hides the controls two seconds after the mouse stops moving, even while it still rests
 * on the video, and hides the bar entirely until the first play. Now a resting mouse keeps them up,
 * they show before the first play, and they hide as soon as the mouse leaves a playing video.
 * Fullscreen keeps the idle timeout, since the mouse never leaves the player there. Touch is
 * unchanged: a tap still toggles the controls.
 */
export function showControlsOnHover(player: Player) {
    let keepActive: number | null = null;

    const stopKeepingActive = () => {
        if (keepActive !== null) {
            player.clearInterval(keepActive);
            keepActive = null;
        }
    };

    player.on('pointerenter', (event: PointerEvent) => {
        // An iPad trackpad reports itself as a mouse too
        if (event.pointerType !== 'mouse') {
            return;
        }
        player.addClass('vjs-mouse-over');
        player.reportUserActivity(event);
        stopKeepingActive();
        keepActive = player.setInterval(() => {
            if (!player.isFullscreen()) {
                player.reportUserActivity(null);
            }
        }, KEEP_ACTIVE_MS);
    });

    player.on('pointerleave', (event: PointerEvent) => {
        if (event.pointerType !== 'mouse') {
            return;
        }
        player.removeClass('vjs-mouse-over');
        stopKeepingActive();
        if (!player.paused()) {
            player.userActive(false);
        }
    });
}
