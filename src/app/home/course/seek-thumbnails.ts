/**
 * Seek thumbnails for the progress bar. FlickMan's nginx-vod captures each image on request from the video file behind
 * an HLS source (its /thumb/ location), so the player only lists which image covers which stretch of the video.
 */

/** Files nginx-vod can capture from, cheapest to decode first */
const CAPTURE_FILES = ['h264.mp4', 'hevc.mp4', 'av1.mp4'];
/** An nginx-vod HLS source: {host}/hls/{folder}/{file}.mp4/{playlist}.m3u8, with the stream key in the query */
const NGINX_VOD_HLS = /^(.+)\/hls\/((?:.+\/)?([^/]+\.mp4))\/[^/?#]+\.m3u8(\?[^#]*)?$/;
/** Image width, the skin's default --media-slider-preview-max-width */
const IMAGE_WIDTH = 240;
/** Shortest stretch of video one image covers, in seconds */
const MIN_INTERVAL = 10;
/** Most images per video, so a long lecture stays within what the slider can point at */
const MAX_IMAGES = 240;

export interface SeekThumbnailCue {
    startTime: number;
    endTime: number;
    /** Image URL */
    text: string;
}

/**
 * Image URL for a time in the video, captured from the cheapest file to decode among the nginx-vod HLS sources, or
 * null if there is none. The stream key in the source's query string authorizes the image as well.
 */
export function seekThumbnailUrl(sources: { src?: string }[]): ((seconds: number) => string) | null {
    let best: { rank: number, prefix: string, query: string } | null = null;
    for (const source of sources) {
        const match = source.src?.match(NGINX_VOD_HLS);
        if (!match) {
            continue;
        }
        const index = CAPTURE_FILES.indexOf(match[3]);
        const rank = index === -1 ? CAPTURE_FILES.length : index;
        if (!best || rank < best.rank) {
            best = {rank, prefix: `${match[1]}/thumb/${match[2]}/`, query: match[4] ?? ''};
        }
    }
    if (!best) {
        return null;
    }
    const {prefix, query} = best;
    return seconds => `${prefix}thumb-${Math.max(0, Math.round(seconds * 1000))}-w${IMAGE_WIDTH}.jpg${query}`;
}

/** Cues for a thumbnails track covering the whole video, each showing the image from the middle of its stretch */
export function seekThumbnailCues(sources: { src?: string }[], duration: number | undefined): SeekThumbnailCue[] {
    const urlAt = seekThumbnailUrl(sources);
    if (!urlAt || !duration || !Number.isFinite(duration) || duration <= 0) {
        return [];
    }
    const interval = Math.max(MIN_INTERVAL, Math.ceil(duration / MAX_IMAGES));
    const cues: SeekThumbnailCue[] = [];
    for (let start = 0; start < duration; start += interval) {
        const end = Math.min(start + interval, duration);
        cues.push({startTime: start, endTime: end, text: urlAt((start + end) / 2)});
    }
    return cues;
}
