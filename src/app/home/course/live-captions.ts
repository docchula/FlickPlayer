import videojs from 'video.js';
import type Player from 'video.js/dist/types/player';
import type Component from 'video.js/dist/types/component';
import type MenuButton from 'video.js/dist/types/menu/menu-button';
import type MenuItem from 'video.js/dist/types/menu/menu-item';

/*
 * Captions written live from the lecture's sound. A website cannot switch on Chrome's own Live Caption,
 * but from Chrome 135 on computers the Web Speech API can listen to a video instead of the microphone.
 * Chrome then recognises the speech on the device, with the engine behind Live Caption, when it has the
 * language, and with Google's online speech service otherwise.
 */

export type CaptionLanguage = 'th-TH' | 'en-US';

const LANGUAGES: {lang: CaptionLanguage, label: string}[] = [
    {lang: 'th-TH', label: 'Thai'},
    {lang: 'en-US', label: 'English'},
];

const STORAGE_KEY = 'liveCaptions';
/** Finished phrases kept for the two lines on screen. */
const KEPT_PHRASES = 6;
/** Captions clear once nothing has been said for this long, as Chrome's do. */
const CLEAR_AFTER_MS = 8000;
const RETRY_AFTER_MS = 5000;

const FAILURES: Record<string, string> = {
    'audio-capture': 'Live captions cannot hear this video',
    'language-not-supported': 'Live captions are not available in this language',
    'not-allowed': 'This browser does not allow live captions',
    'service-not-allowed': 'This browser does not allow live captions',
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

/** The phrases a result event finished, and the words still being heard after them. */
export function readResults(resultIndex: number, results: SpeechRecognitionResultList): {finished: string[], hearing: string} {
    const finished: string[] = [];
    const hearing: string[] = [];
    for (let i = resultIndex; i < results.length; i++) {
        const transcript = results[i][0]?.transcript.trim();
        if (transcript) {
            (results[i].isFinal ? finished : hearing).push(transcript);
        }
    }

    return {finished, hearing: hearing.join(' ')};
}

async function onDevice(lang: CaptionLanguage): Promise<boolean> {
    try {
        return await recognitionClass()?.available?.({langs: [lang], processLocally: true}) === 'available';
    } catch {
        return false;
    }
}

/** Chrome keeps one copy of each language for every site, as for its own Live Caption. */
async function download(lang: CaptionLanguage): Promise<void> {
    const Recognition = recognitionClass();
    const options = {langs: [lang], processLocally: true};
    try {
        if (await Recognition?.available?.(options) === 'downloadable') {
            await Recognition.install?.(options);
        }
    } catch {
        // The online service is used until the language is on the device
    }
}

function readLanguage(): CaptionLanguage | null {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);

        return LANGUAGES.find(language => language.lang === stored)?.lang ?? null;
    } catch {
        return null;
    }
}

function writeLanguage(lang: CaptionLanguage | null): void {
    try {
        if (lang) {
            localStorage.setItem(STORAGE_KEY, lang);
        } else {
            localStorage.removeItem(STORAGE_KEY);
        }
    } catch {
        // Ignore storage errors
    }
}

const VjsMenuButton = videojs.getComponent('MenuButton') as unknown as typeof MenuButton;
const VjsMenuItem = videojs.getComponent('MenuItem') as unknown as typeof MenuItem;

class LanguageMenuItem extends VjsMenuItem {
    handleClick(): void {
        this.options_.choose();
    }
}

/** The live captions menu in the player's control bar, and the captions it writes over the video. */
export class LiveCaptions {
    private readonly box: HTMLElement;
    private readonly lines: HTMLElement;
    private readonly text: HTMLElement;
    private readonly button: MenuButton;
    private readonly items: {lang: CaptionLanguage | null, item: MenuItem}[];
    private language = readLanguage();
    private recognition: Recognition | null = null;
    /** Bumped whenever listening stops, so a start still waiting on Chrome is dropped. */
    private attempt = 0;
    private stream: MediaStream | null = null;
    private phrases: string[] = [];
    private hearing = '';
    /** Why the captions that are on cannot be written for this video. */
    private failure: string | null = null;
    private clearTimer: ReturnType<typeof setTimeout> | undefined;
    private retryTimer: ReturnType<typeof setTimeout> | undefined;

    private readonly onPlaying = () => {
        if (this.language && this.failure) {
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
        this.clear();
    };

    /** Live captions for the player, where the browser can write them. */
    static attach(player: Player): LiveCaptions | null {
        return canCaptionVideo() ? new LiveCaptions(player) : null;
    }

    constructor(private readonly player: Player) {
        const controlBar = player.getChild('ControlBar') as Component;
        this.button = new VjsMenuButton(player, {title: 'Live captions'});
        this.button.addClass('vjs-live-captions-button');
        this.button.el().querySelector('.vjs-icon-placeholder')?.classList.add('vjs-icon-captions');
        this.items = [{lang: null, label: 'Off'}, ...LANGUAGES].map(({lang, label}) => {
            const item = new LanguageMenuItem(player, {label, selectable: true, choose: () => this.choose(lang)});
            this.button.menu.addItem(item);

            return {lang, item};
        });
        // Where video.js puts its own captions menu
        const next = controlBar.getChild('PictureInPictureToggle') ?? controlBar.getChild('FullscreenToggle');
        controlBar.addChild(this.button, {}, next ? controlBar.children().indexOf(next) : undefined);

        this.box = document.createElement('div');
        this.box.className = 'vjs-live-captions vjs-hidden';
        this.lines = document.createElement('div');
        this.lines.className = 'vjs-live-captions-lines';
        this.text = document.createElement('span');
        this.text.className = 'vjs-live-captions-text';
        const line = document.createElement('div');
        line.append(this.text);
        this.lines.append(line);
        this.box.append(this.lines);
        // Under the control bar, so its menus open over the captions
        player.el().insertBefore(this.box, controlBar.el());

        player.on('playing', this.onPlaying);
        player.on('pause', this.onPause);
        player.on('seeking', this.onSeeking);
        player.on('loadstart', this.onLoadStart);
        this.showChoice();
    }

    dispose(): void {
        this.player.off('playing', this.onPlaying);
        this.player.off('pause', this.onPause);
        this.player.off('seeking', this.onSeeking);
        this.player.off('loadstart', this.onLoadStart);
        this.stopListening();
        this.releaseStream();
        this.clear();
        this.box.remove();
        this.player.getChild('ControlBar')?.removeChild(this.button);
        this.button.dispose();
    }

    private choose(lang: CaptionLanguage | null): void {
        this.language = lang;
        writeLanguage(lang);
        this.showChoice();
        this.stopListening();
        this.failure = null;
        this.clear();
        if (lang) {
            download(lang);
            this.listen();
        }
    }

    private showChoice(): void {
        for (const {lang, item} of this.items) {
            item.selected(lang === this.language);
        }
        const label = LANGUAGES.find(language => language.lang === this.language)?.label;
        this.button.toggleClass('vjs-live-captions-on', !!label);
        this.button.controlText(label ? `Live captions (${label})` : 'Live captions');
        this.lines.lang = this.language?.slice(0, 2) ?? '';
    }

    private listen(): void {
        const lang = this.language;
        if (!lang || this.failure || this.recognition || this.player.paused()) {
            return;
        }
        clearTimeout(this.retryTimer);
        const attempt = ++this.attempt;
        onDevice(lang).then(local => {
            if (attempt !== this.attempt || this.recognition || this.player.paused()) {
                return;
            }
            const track = this.audioTrack();
            if (track) {
                this.recognize(lang, local, track);
            } else {
                this.fail(FAILURES['audio-capture']);
            }
        });
    }

    private recognize(lang: CaptionLanguage, local: boolean, track: MediaStreamTrack): void {
        const recognition = new (recognitionClass())();
        recognition.lang = lang;
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

    private audioTrack(): MediaStreamTrack | null {
        const live = this.stream?.getAudioTracks().find(track => track.readyState === 'live');
        if (live) {
            return live;
        }
        this.releaseStream();
        const video = this.player.tech(true)?.el() as HTMLMediaElement & {captureStream?: () => MediaStream};
        try {
            this.stream = video?.captureStream?.() ?? null;
        } catch {
            // Video from a server that does not let this site read it
            return null;
        }
        this.stream?.getVideoTracks().forEach(track => track.stop());

        return this.stream?.getAudioTracks()[0] ?? null;
    }

    private releaseStream(): void {
        this.stream?.getTracks().forEach(track => track.stop());
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
        if (this.text.textContent) {
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
