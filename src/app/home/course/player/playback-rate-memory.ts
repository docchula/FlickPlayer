import type Player from 'video.js/dist/types/player';

// localStorage key for the speed a student last chose
export const PLAYBACK_RATE_KEY = 'flickPlaybackRate';

// The Html5 tech holds a default rate for the element; the YouTube tech has no such setter
interface DefaultPlaybackRateTech {
    setDefaultPlaybackRate?(rate: number): void;
}

/**
 * Start every video at the speed the student last chose, including after a reload.
 *
 * Loading a source resets the media element's speed to its default rate, so picking another
 * lecture used to drop back to 1x. The chosen speed is now saved, kept as the element's default
 * and put back once each new source has loaded its metadata.
 */
export function rememberPlaybackRate(player: Player) {
    let preferredRate = loadPlaybackRate();

    const applyPreferredRate = () => {
        if (preferredRate === null) {
            return;
        }
        setDefaultPlaybackRate(player, preferredRate);
        if (player.playbackRate() !== preferredRate) {
            player.playbackRate(preferredRate);
        }
    };

    applyPreferredRate();
    // The default rate covers most loads, but a newly created tech, or one without a default rate
    // (YouTube), starts each source at 1x.
    player.on('loadedmetadata', applyPreferredRate);

    player.on('ratechange', () => {
        // A source being loaded resets the speed before its metadata arrives. That reset is not
        // the student's choice, and loadedmetadata puts the saved speed back.
        if (player.readyState() < HTMLMediaElement.HAVE_METADATA) {
            return;
        }
        const rate = player.playbackRate();
        if (!isUsableRate(rate) || rate === preferredRate) {
            return;
        }
        preferredRate = rate;
        setDefaultPlaybackRate(player, rate);
        savePlaybackRate(rate);
    });
}

function setDefaultPlaybackRate(player: Player, rate: number) {
    (player.tech(true) as unknown as DefaultPlaybackRateTech | undefined)?.setDefaultPlaybackRate?.(rate);
}

function isUsableRate(rate: number) {
    // Browsers refuse speeds above 16x
    return Number.isFinite(rate) && rate > 0 && rate <= 16;
}

function loadPlaybackRate(): number | null {
    try {
        const rate = parseFloat(localStorage.getItem(PLAYBACK_RATE_KEY) ?? '');
        return isUsableRate(rate) ? rate : null;
    } catch {
        return null; // Storage blocked; every video starts at 1x as before
    }
}

function savePlaybackRate(rate: number) {
    try {
        localStorage.setItem(PLAYBACK_RATE_KEY, String(rate));
    } catch {
        // Storage blocked or full; the speed is still kept for the rest of this visit
    }
}
