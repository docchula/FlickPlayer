/**
 * The Pomodoro phase-change notification.
 *
 * Rendered outside the Angular component tree, for two reasons:
 *
 * 1. `.ion-page` sets `contain: layout`, which makes it the containing block for `position: fixed`
 *    descendants. A toast rendered inside the page is therefore positioned against the page box
 *    rather than the viewport, so it drifts by however much the two disagree — which on iOS in-app
 *    browsers (the Google and Chrome apps) is the height of their dynamic toolbar, dropping the
 *    toast down over the course list. Attaching to body restores true viewport positioning.
 * 2. While an element is fullscreen the browser paints only that element's subtree, so the toast has
 *    to live inside the fullscreen element for the duration.
 *
 * Both are handled by attaching to `document.body`, or to the fullscreen element while one is
 * active, and following the fullscreen element as it changes.
 *
 * Deliberately free of Angular and Ionic imports so it can be exercised directly in a browser test.
 */
export class PomodoroToast {
    /** How long the toast stays fully visible before it starts fading. */
    static readonly VISIBLE_MS = 5000;
    /** Must outlast the opacity transition on `.pomodoro-toast` in global.scss. */
    static readonly FADE_MS = 300;

    private static readonly FULLSCREEN_EVENTS = ['fullscreenchange', 'webkitfullscreenchange', 'mozfullscreenchange'];
    private static readonly BELL_SVG =
        '<svg viewBox="0 0 512 512" aria-hidden="true" focusable="false">' +
        '<path fill="currentColor" d="M256 480a64 64 0 0 0 63-53h-126a64 64 0 0 0 63 53zm160-141-33-38v-97a127 127 0 0 0-96-123v-13a31 31 0 1 0-62 0v13a127 127 0 0 0-96 123v97l-33 38a16 16 0 0 0 12 27h296a16 16 0 0 0 12-27z"/>' +
        '</svg>';

    private el: HTMLElement | null = null;
    private titleEl: HTMLElement | null = null;
    private bodyEl: HTMLElement | null = null;
    private hideTimer: ReturnType<typeof setTimeout> | null = null;
    private removeTimer: ReturnType<typeof setTimeout> | null = null;
    private destroyed = false;

    constructor(private readonly doc: Document = document) {
        for (const event of PomodoroToast.FULLSCREEN_EVENTS) {
            this.doc.addEventListener(event, this.onFullscreenChange);
        }
    }

    /** The live toast element, or null when nothing has been shown yet. Exposed for tests. */
    get element(): HTMLElement | null {
        return this.el;
    }

    /** Show (or replace the contents of) the toast and start its auto-hide countdown. */
    show(title: string, body: string): void {
        if (this.destroyed) {
            return;
        }
        this.clearTimers();

        if (!this.el) {
            this.build();
        }
        // Set as text, never markup: these strings are the only variable part of the toast.
        this.titleEl!.textContent = title;
        this.bodyEl!.textContent = body;

        this.attachToHost();

        // Restart the entry transition. The browser has to observe the un-shown state before
        // `show` goes back on, or a toast replaced while still on screen jumps to the end state
        // with no animation. Reading offsetWidth forces that style flush synchronously — waiting
        // for animation frames instead would leave the toast invisible in any context where the
        // next frame never comes (a throttled or non-compositing tab).
        const el = this.el!;
        el.classList.remove('show');
        void el.offsetWidth;
        el.classList.add('show');

        this.hideTimer = setTimeout(() => {
            el.classList.remove('show');
            this.removeTimer = setTimeout(() => el.remove(), PomodoroToast.FADE_MS);
        }, PomodoroToast.VISIBLE_MS);
    }

    /** Remove the toast and stop listening. The instance is inert afterwards. */
    destroy(): void {
        this.destroyed = true;
        this.clearTimers();
        for (const event of PomodoroToast.FULLSCREEN_EVENTS) {
            this.doc.removeEventListener(event, this.onFullscreenChange);
        }
        this.el?.remove();
        this.el = null;
        this.titleEl = null;
        this.bodyEl = null;
    }

    /**
     * Where the toast must live to be visible right now: inside the fullscreen element if there is
     * one, otherwise on document.body.
     */
    private getHost(): HTMLElement {
        const doc = this.doc as Document & { webkitFullscreenElement?: Element; mozFullScreenElement?: Element };
        const fullscreenEl = this.doc.fullscreenElement ?? doc.webkitFullscreenElement ?? doc.mozFullScreenElement;
        return (fullscreenEl as HTMLElement | null) ?? this.doc.body;
    }

    private attachToHost(): void {
        const host = this.getHost();
        if (this.el && this.el.parentElement !== host) {
            host.appendChild(this.el);
        }
    }

    /** Follow the fullscreen element in and out of fullscreen, but only while a toast is on screen. */
    private onFullscreenChange = (): void => {
        if (this.destroyed || !this.el || !this.el.isConnected) {
            return;
        }
        this.attachToHost();
    };

    private build(): void {
        const el = this.doc.createElement('div');
        el.className = 'pomodoro-toast';
        // Announced by assistive tech without stealing focus from the video.
        el.setAttribute('role', 'status');
        el.setAttribute('aria-live', 'polite');

        const icon = this.doc.createElement('span');
        icon.className = 'pomodoro-toast-icon';
        // Static markup, no interpolation.
        icon.innerHTML = PomodoroToast.BELL_SVG;

        const text = this.doc.createElement('div');
        text.className = 'pomodoro-toast-text';
        this.titleEl = this.doc.createElement('strong');
        this.bodyEl = this.doc.createElement('span');
        text.append(this.titleEl, this.bodyEl);

        el.append(icon, text);
        this.el = el;
    }

    private clearTimers(): void {
        if (this.hideTimer) {
            clearTimeout(this.hideTimer);
            this.hideTimer = null;
        }
        if (this.removeTimer) {
            clearTimeout(this.removeTimer);
            this.removeTimer = null;
        }
    }

}
