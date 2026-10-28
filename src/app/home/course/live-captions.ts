import type Player from 'video.js/dist/types/player';
import type Component from 'video.js/dist/types/component';
import type FullscreenToggle from 'video.js/dist/types/control-bar/fullscreen-toggle';
import type MenuButton from 'video.js/dist/types/menu/menu-button';
import type MenuItem from 'video.js/dist/types/menu/menu-item';

/*
 * Captions written live from the lecture's sound. A website cannot switch on Chrome's own Live Caption,
 * but from Chrome 135 on computers the Web Speech API can listen to a video instead of the microphone.
 * Chrome then recognises the speech on the device, with the engine behind Live Caption, when it has Thai,
 * and with Google's online speech service otherwise.
 *
 * A page cannot listen to a video from a server that does not let other sites read it, as the faculty's
 * video server does not, nor to one on YouTube. For those Chrome is asked to share this tab's sound
 * instead, which the user allows each time the captions are turned on, or once a visit with "Always allow".
 * Chrome never remembers that permission once the page is opened anew.
 */

/** Lectures are given in Thai, with the English terms said along the way. */
const LANG = 'th-TH';

/** Chrome's recognizer on the device puts a space between Thai words, which Thai is not written with. */
const THAI_WORD_GAP = /([฀-๿]) +(?=[฀-๿])/g;

const STORAGE_KEY = 'liveCaptions';
const ALWAYS_ALLOW_KEY = 'liveCaptionsAlwaysAllow';
/** Finished phrases kept for the two lines on screen. */
const KEPT_PHRASES = 6;
/** Captions clear once nothing has been said for this long, as Chrome's do. */
const CLEAR_AFTER_MS = 8000;
const RETRY_AFTER_MS = 5000;
const INSTALL_WAIT_MS = 3000;
/** Chrome's recognizer falls behind faster speech, and from 1.75× it heard nothing of a test lecture. */
const MAX_RATE = 1.5;

const FAILURES: Record<string, string> = {
    'audio-capture': 'Live captions cannot hear this video',
    'language-not-supported': 'Live captions are not available in Thai in this browser',
    'not-allowed': 'This browser does not allow live captions',
    'service-not-allowed': 'This browser does not allow live captions',
};
/** Chrome asks to share the tab only straight after a click or a key press. */
const CLICK_TO_SHARE = 'Click CC to let live captions hear this tab';
const NOT_SHARED = 'Live captions need to hear this tab';
const NO_TAB_AUDIO = 'Live captions need the tab shared with its audio';
/** The tab's sound is what it plays, so a muted video leaves nothing to hear. */
const MUTED = 'Live captions cannot hear a muted video';
const ASK_ONCE = 'Chrome will ask to share this tab once each time Flick is opened';
const TOO_FAST = 'Live captions cannot keep up above 1.5× speed';

/** Chrome's options for sharing a tab, which TypeScript does not know yet. */
interface TabShareOptions extends DisplayMediaStreamOptions {
    preferCurrentTab: boolean;
    selfBrowserSurface: 'include' | 'exclude';
    surfaceSwitching: 'include' | 'exclude';
    monitorTypeSurfaces: 'include' | 'exclude';
}

/** This tab only, without offering other tabs, windows or screens. */
const TAB_SHARE: TabShareOptions = {
    // Chrome shares no sound without the picture, which is stopped as soon as it comes
    video: true,
    audio: true,
    preferCurrentTab: true,
    selfBrowserSurface: 'include',
    surfaceSwitching: 'exclude',
    monitorTypeSurfaces: 'exclude',
};

interface RecognitionResultEvent extends Event {
    readonly resultIndex: number;
    readonly results: SpeechRecognitionResultList;
}

interface RecognitionErrorEvent extends Event {
    readonly error: string;
}

interface Recognition {
    lang: string;
    continuous: boolean;
    interimResults: boolean;
    processLocally: boolean;
    onresult: ((event: RecognitionResultEvent) => void) | null;
    onerror: ((event: RecognitionErrorEvent) => void) | null;
    onend: (() => void) | null;
    start(audioTrack?: MediaStreamTrack): void;
    abort(): void;
}

interface RecognitionClass {
    new(): Recognition;
    available?(options: {langs: string[], processLocally: boolean}): Promise<string>;
    install?(options: {langs: string[], processLocally: boolean}): Promise<boolean>;
}

export interface UserAgentData {
    brands: {brand: string, version: string}[];
    mobile: boolean;
    platform: string;
}

function recognitionClass(): RecognitionClass | undefined {
    const scope = window as unknown as {SpeechRecognition?: RecognitionClass, webkitSpeechRecognition?: RecognitionClass};

    return scope.SpeechRecognition ?? scope.webkitSpeechRecognition;
}

/**
 * Whether the browser can caption a video's sound. Anywhere else start() ignores the track it is given
 * and listens to the microphone, so this has to be known before starting rather than found out.
 */
export function canCaptionVideo(
    userAgentData = (navigator as Navigator & {userAgentData?: UserAgentData}).userAgentData,
): boolean {
    const chromium = userAgentData?.brands.find(brand => brand.brand === 'Chromium');

    return !!chromium && Number(chromium.version) >= 135
        && !userAgentData.mobile && userAgentData.platform !== 'Android'
        && !!recognitionClass();
}

/** Google's page on turning Chrome's own Live Caption on and off, as no page can open Chrome's settings. */
export const CHROME_LIVE_CAPTION_HELP = 'https://support.google.com/chrome/answer/10538231?co=GENIE.Platform%3DDesktop';

/** Chrome's own Live Caption, which hears any video, comes only with Google Chrome on a computer. */
export function hasChromeLiveCaption(
    userAgentData = (navigator as Navigator & {userAgentData?: UserAgentData}).userAgentData,
): boolean {
    return !!userAgentData && !userAgentData.mobile
        && ['macOS', 'Windows'].includes(userAgentData.platform)
        && userAgentData.brands.some(brand => brand.brand === 'Google Chrome');
}

/** The phrases a result event finished, and the words still being heard after them. */
export function readResults(resultIndex: number, results: SpeechRecognitionResultList): {finished: string[], hearing: string} {
    const finished: string[] = [];
    const hearing: string[] = [];
    for (let i = resultIndex; i < results.length; i++) {
        const transcript = results[i][0]?.transcript.replace(THAI_WORD_GAP, '$1').trim();
        if (transcript) {
            (results[i].isFinal ? finished : hearing).push(transcript);
        }
    }

    return {finished, hearing: hearing.join(' ')};
}

/**
 * Whether Chrome's recognizer on the device, the engine behind its own Live Caption, can be used. Each site has to
 * ask for Thai once, even when Chrome already has it, and until then Google's online service is used.
 */
async function onDevice(): Promise<boolean> {
    const Recognition = recognitionClass();
    const options = {langs: [LANG], processLocally: true};
    try {
        const availability = await Recognition?.available?.(options);
        if (availability === 'downloadable' || availability === 'downloading') {
            // Thai Chrome already has comes at once; a first download carries on behind the online service
            await Promise.race([Recognition.install?.(options), new Promise(resolve => setTimeout(resolve, INSTALL_WAIT_MS))]);
        }

        return await Recognition?.available?.(options) === 'available';
    } catch {
        return false;
    }
}

/** Chrome keeps one copy of each language for every site, as for its own Live Caption. */
async function download(): Promise<void> {
    const Recognition = recognitionClass();
    const options = {langs: [LANG], processLocally: true};
    try {
        if (await Recognition?.available?.(options) === 'downloadable') {
            await Recognition.install?.(options);
        }
    } catch {
        // The online service is used until Thai is on the device
    }
}

function readOn(key: string): boolean {
    try {
        return localStorage.getItem(key) === 'on';
    } catch {
        return false;
    }
}

function stop(stream: MediaStream | null): void {
    stream?.getTracks().forEach(track => track.stop());
}

function writeOn(key: string, on: boolean): void {
    try {
        if (on) {
            localStorage.setItem(key, 'on');
        } else {
            localStorage.removeItem(key);
        }
    } catch {
        // Ignore storage errors
    }
}

/** This tab's sound once shared. With "Always allow" it outlives turning the captions off and the course page. */
let sharedTab: MediaStream | null = null;

function tabTrack(): MediaStreamTrack | null {
    return sharedTab?.getAudioTracks().find(track => track.readyState === 'live') ?? null;
}

function releaseTab(): void {
    stop(sharedTab);
    sharedTab = null;
}

/** Chrome's own full screen, which sharing the tab does not hold back. */
function fullScreenHint(
    userAgentData = (navigator as Navigator & {userAgentData?: UserAgentData}).userAgentData,
): string {
    return `Press ${userAgentData?.platform === 'macOS' ? '⌃⌘F' : 'F11'} for full screen`;
}

/** video.js is loaded when first needed, so its classes come from the player rather than an import. */
function componentClass<T>(player: Player, name: string): T {
    return (player.constructor as unknown as {getComponent(name: string): T}).getComponent(name);
}

/** CC, with a menu like the playback rate's for always allowing the tab to be heard. */
function createButton(player: Player, toggle: () => void, allow: (always: boolean) => void, always: boolean): MenuButton {
    const Base = componentClass<typeof MenuButton>(player, 'MenuButton');
    const Item = componentClass<typeof MenuItem>(player, 'MenuItem');

    class AlwaysAllowItem extends Item {
        handleClick(): void {
            this.selected(!this.isSelected_);
            allow(this.isSelected_);
        }
    }

    class LiveCaptionsButton extends Base {
        buildCSSClass(): string {
            return `vjs-live-captions-button ${super.buildCSSClass()}`;
        }

        createItems(): MenuItem[] {
            return [new AlwaysAllowItem(player, {label: 'Always allow', selectable: true, multiSelectable: true, selected: always})];
        }

        handleClick(): void {
            toggle();
        }
    }

    return new LiveCaptionsButton(player, {title: 'Live captions'});
}

/** The live captions button in the player's control bar, and the captions it writes over the video. */
export class LiveCaptions {
    private readonly box: HTMLElement;
    private readonly text: HTMLElement;
    private readonly button: MenuButton;
    private readonly requestFullscreen: Player['requestFullscreen'];
    private readonly exitFullscreen: Player['exitFullscreen'];
    private on = readOn(STORAGE_KEY);
    private alwaysAllow = readOn(ALWAYS_ALLOW_KEY);
    private recognition: Recognition | null = null;
    /** Bumped whenever listening stops, so a start still waiting on Chrome is dropped. */
    private attempt = 0;
    private stream: MediaStream | null = null;
    private sharing: Promise<MediaStreamTrack | null> | null = null;
    /** The shared tab's sound this player listens to, for Chrome's "Stop sharing". */
    private watched: MediaStreamTrack | null = null;
    /** Chrome needs a click before it asks to share the tab, and the next click on CC is that click. */
    private waitingForShare = false;
    private disposed = false;
    private phrases: string[] = [];
    private hearing = '';
    /** Why the captions that are on cannot be written for this video. */
    private failure: string | null = null;
    private clearTimer: ReturnType<typeof setTimeout> | undefined;
    private retryTimer: ReturnType<typeof setTimeout> | undefined;

    private readonly onPlaying = () => {
        if (this.on && this.failure) {
            this.notify(this.failure);
        }
        this.clearLater();
        this.listen();
    };
    private readonly onPause = () => {
        this.stopListening();
        clearTimeout(this.clearTimer);
    };
    private readonly onSeeking = () => {
        this.stopListening();
        this.clear();
        this.listen();
    };
    private readonly onLoadStart = () => {
        this.stopListening();
        this.releaseStream();
        this.failure = null;
        this.waitingForShare = false;
        this.clear();
    };
    private readonly onVolumeChange = () => {
        if (!this.on || !tabTrack()) {
            return;
        }
        if (this.player.muted() || this.player.volume() === 0) {
            this.notify(MUTED);
        } else if (this.text.textContent === MUTED) {
            this.clear();
        }
    };
    private readonly onRateChange = () => {
        if (this.on && this.player.playbackRate() > MAX_RATE) {
            this.notify(TOO_FAST);
        }
    };
    private readonly onTabEnded = () => {
        releaseTab();
        this.watch(null);
        if (this.on) {
            this.turnOff();
        }
    };
    /** video.js announces a full window only where fullscreen is prefixed, so its button is told here. */
    private readonly onFullWindow = () => {
        (this.player.getChild('ControlBar')?.getChild('FullscreenToggle') as FullscreenToggle | undefined)?.handleFullscreenChange();
    };

    /** Live captions for the player, where the browser can write them. */
    static attach(player: Player): LiveCaptions | null {
        return canCaptionVideo() ? new LiveCaptions(player) : null;
    }

    constructor(private readonly player: Player) {
        const controlBar = player.getChild('ControlBar') as Component;
        // Where video.js puts its own captions button
        const next = controlBar.getChild('PictureInPictureToggle') ?? controlBar.getChild('FullscreenToggle');
        this.button = createButton(player, () => this.toggle(), always => this.setAlwaysAllow(always), this.alwaysAllow);
        controlBar.addChild(this.button, {}, next ? controlBar.children().indexOf(next) : undefined);

        this.box = document.createElement('div');
        this.box.className = 'vjs-live-captions vjs-hidden';
        const lines = document.createElement('div');
        lines.className = 'vjs-live-captions-lines';
        lines.lang = 'th';
        const line = document.createElement('div');
        this.text = document.createElement('span');
        this.text.className = 'vjs-live-captions-text';
        line.append(this.text);
        lines.append(line);
        this.box.append(lines);
        // Under the control bar, so its menus open over the captions
        player.el().insertBefore(this.box, controlBar.el());

        player.on('playing', this.onPlaying);
        player.on('pause', this.onPause);
        player.on('seeking', this.onSeeking);
        player.on('loadstart', this.onLoadStart);
        player.on('volumechange', this.onVolumeChange);
        player.on('ratechange', this.onRateChange);
        player.on(['enterFullWindow', 'exitFullWindow'], this.onFullWindow);

        // The fullscreen button, the F key and a double click all come through these
        this.requestFullscreen = player.requestFullscreen;
        this.exitFullscreen = player.exitFullscreen;
        player.requestFullscreen = options => tabTrack() ? this.fillWindow() : this.requestFullscreen.call(player, options);
        player.exitFullscreen = () => player.isFullWindow ? this.leaveWindow() : this.exitFullscreen.call(player);
        this.render();
    }

    dispose(): void {
        this.disposed = true;
        this.player.off('playing', this.onPlaying);
        this.player.off('pause', this.onPause);
        this.player.off('seeking', this.onSeeking);
        this.player.off('loadstart', this.onLoadStart);
        this.player.off('volumechange', this.onVolumeChange);
        this.player.off('ratechange', this.onRateChange);
        this.player.off(['enterFullWindow', 'exitFullWindow'], this.onFullWindow);
        this.player.requestFullscreen = this.requestFullscreen;
        this.player.exitFullscreen = this.exitFullscreen;
        this.stopListening();
        this.releaseStream();
        this.watch(null);
        if (!this.alwaysAllow) {
            releaseTab();
        }
        this.clear();
        this.box.remove();
        this.player.getChild('ControlBar')?.removeChild(this.button);
        this.button.dispose();
    }

    private toggle(): void {
        if (this.on && this.waitingForShare) {
            this.waitingForShare = false;
            this.clear();
            this.shareTab().then(track => {
                if (track) {
                    this.listen();
                } else if (this.waitingForShare) {
                    // Chrome would not ask even now, so CC must not keep asking to be clicked
                    this.turnOff();
                }
            });
            return;
        }
        this.switchTo(!this.on);
    }

    private switchTo(on: boolean): void {
        this.on = on;
        writeOn(STORAGE_KEY, on);
        this.render();
        this.stopListening();
        this.failure = null;
        this.waitingForShare = false;
        this.clear();
        if (on) {
            download();
            this.listen();
            this.onRateChange();
        } else if (!this.alwaysAllow) {
            this.watch(null);
            releaseTab();
        }
    }

    private setAlwaysAllow(always: boolean): void {
        this.alwaysAllow = always;
        writeOn(ALWAYS_ALLOW_KEY, always);
        if (always) {
            this.notify(ASK_ONCE);
        } else if (!this.on) {
            this.watch(null);
            releaseTab();
        }
    }

    private turnOff(notice?: string): void {
        this.switchTo(false);
        if (notice) {
            this.notify(notice);
        }
    }

    private render(): void {
        this.button.menuButton_.toggleClass('vjs-live-captions-on', this.on);
        this.button.menuButton_.el().setAttribute('aria-pressed', String(this.on));
        this.button.controlText(this.on ? 'Turn live captions off' : 'Turn live captions on');
    }

    /**
     * While any of this tab is shared, Chrome keeps a page's fullscreen inside the tab and squeezes it to the
     * shape of the capture. Filling the window instead keeps the player's size and its seek bar, and Chrome's
     * own full screen is not held back.
     */
    private fillWindow(): Promise<void> {
        this.player.enterFullWindow();
        if (outerWidth < screen.width || outerHeight < screen.height) {
            this.notify(fullScreenHint());
        }

        return Promise.resolve();
    }

    private leaveWindow(): Promise<void> {
        this.player.exitFullWindow();

        return Promise.resolve();
    }

    /** A share that starts in fullscreen squeezes it straight away, so the player fills the window instead. */
    private moveToWindow(): void {
        if (document.fullscreenElement !== this.player.el()) {
            return;
        }
        // Once video.js has seen fullscreen end
        const fill = () => setTimeout(() => this.fillWindow());
        document.addEventListener('fullscreenchange', fill, {once: true});
        document.exitFullscreen().catch(() => document.removeEventListener('fullscreenchange', fill));
    }

    private listen(): void {
        if (!this.on || this.failure || this.recognition || this.player.paused()) {
            return;
        }
        clearTimeout(this.retryTimer);
        const attempt = ++this.attempt;
        // The sound first: Chrome asks to share the tab only soon after the click that started the captions
        Promise.all([this.audioTrack(), onDevice()]).then(([track, local]) => {
            // The user may have paused or seeked while Chrome asked to share the tab
            if (track && attempt === this.attempt && !this.recognition && !this.player.paused()) {
                this.recognize(local, track);
                this.onVolumeChange();
            }
        });
    }

    private recognize(local: boolean, track: MediaStreamTrack): void {
        const recognition = new (recognitionClass())();
        recognition.lang = LANG;
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.processLocally = local;
        const startedAt = Date.now();
        let offline = false;
        recognition.onresult = event => {
            if (recognition !== this.recognition) {
                return;
            }
            const {finished, hearing} = readResults(event.resultIndex, event.results);
            this.phrases.push(...finished);
            this.phrases.splice(0, this.phrases.length - KEPT_PHRASES);
            this.hearing = hearing;
            this.show(false);
        };
        recognition.onerror = event => {
            if (recognition !== this.recognition || event.error === 'no-speech' || event.error === 'aborted') {
                return;
            }
            if (event.error === 'network') {
                offline = true;
                this.notify('Live captions need an internet connection');
            } else {
                this.fail(FAILURES[event.error] ?? 'Live captions stopped');
            }
        };
        recognition.onend = () => {
            if (recognition !== this.recognition) {
                return;
            }
            this.recognition = null;
            this.finishPhrase();
            // Chrome ends a session after a pause in speech, or after a while anyway: carry on while the video plays
            const again = offline || Date.now() - startedAt < 1000 ? RETRY_AFTER_MS : 0;
            this.retryTimer = setTimeout(() => this.listen(), again);
        };
        this.recognition = recognition;
        try {
            recognition.start(track);
        } catch {
            this.recognition = null;
            this.fail('Live captions stopped');
        }
    }

    private stopListening(): void {
        this.attempt++;
        clearTimeout(this.retryTimer);
        const recognition = this.recognition;
        this.recognition = null;
        recognition?.abort();
        this.finishPhrase();
    }

    private finishPhrase(): void {
        if (this.hearing) {
            this.phrases.push(this.hearing);
            this.hearing = '';
        }
    }

    /** The video's sound, or null when there is none to hear. */
    private async audioTrack(): Promise<MediaStreamTrack | null> {
        const tab = tabTrack();
        if (tab) {
            this.watch(tab);
            return tab;
        }
        const own = this.stream?.getAudioTracks().find(track => track.readyState === 'live');
        if (own) {
            return own;
        }
        this.releaseStream();
        const video = this.player.tech(true)?.el() as HTMLMediaElement & {captureStream?: () => MediaStream};
        try {
            this.stream = video?.captureStream?.() ?? null;
        } catch {
            // Video from a server that does not let this site read it
        }
        if (!this.stream) {
            return this.shareTab();
        }
        this.stream.getVideoTracks().forEach(track => track.stop());
        const track = this.stream.getAudioTracks()[0] ?? null;
        if (!track) {
            this.fail(FAILURES['audio-capture']);
        }

        return track;
    }

    /** One request at a time, however often the video plays or seeks while Chrome asks. */
    private shareTab(): Promise<MediaStreamTrack | null> {
        this.sharing ??= this.requestTab().finally(() => this.sharing = null);

        return this.sharing;
    }

    private async requestTab(): Promise<MediaStreamTrack | null> {
        let stream: MediaStream;
        try {
            stream = await navigator.mediaDevices.getDisplayMedia(TAB_SHARE);
        } catch (error) {
            if (this.disposed || !this.on) {
                return null;
            }
            const name = (error as DOMException | undefined)?.name;
            if (name === 'InvalidStateError') {
                this.waitingForShare = true;
                this.notify(CLICK_TO_SHARE);
            } else if (name === 'NotAllowedError') {
                this.turnOff(NOT_SHARED);
            } else {
                this.fail(FAILURES['audio-capture']);
            }
            return null;
        }
        stream.getVideoTracks().forEach(track => track.stop());
        const track = stream.getAudioTracks()[0];
        if (!track) {
            stop(stream);
            if (!this.disposed && this.on) {
                this.turnOff(NO_TAB_AUDIO);
            }
            return null;
        }
        releaseTab();
        sharedTab = stream;
        if (this.disposed || !this.on) {
            // Turned off or left while Chrome asked
            if (!this.alwaysAllow) {
                releaseTab();
            }
            return null;
        }
        this.watch(track);
        this.waitingForShare = false;
        this.moveToWindow();

        return track;
    }

    private watch(track: MediaStreamTrack | null): void {
        this.watched?.removeEventListener('ended', this.onTabEnded);
        this.watched = track;
        track?.addEventListener('ended', this.onTabEnded);
    }

    private releaseStream(): void {
        stop(this.stream);
        this.stream = null;
    }

    private fail(message: string): void {
        this.failure = message;
        this.notify(message);
    }

    private notify(message: string): void {
        this.phrases = [];
        this.hearing = '';
        this.text.textContent = message;
        this.show(true);
    }

    private show(notice: boolean): void {
        if (!notice) {
            this.text.textContent = [...this.phrases, this.hearing].filter(Boolean).join(' ');
        }
        this.box.classList.toggle('vjs-live-captions-notice', notice);
        this.box.classList.toggle('vjs-hidden', !this.text.textContent);
        this.clearLater();
    }

    private clearLater(): void {
        clearTimeout(this.clearTimer);
        // Asking for a click stays up until it comes
        if (this.text.textContent && !this.waitingForShare) {
            this.clearTimer = setTimeout(() => this.clear(), CLEAR_AFTER_MS);
        }
    }

    private clear(): void {
        clearTimeout(this.clearTimer);
        this.phrases = [];
        this.hearing = '';
        this.text.textContent = '';
        this.box.classList.add('vjs-hidden');
    }
}
