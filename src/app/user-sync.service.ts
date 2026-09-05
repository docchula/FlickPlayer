import {DestroyRef, inject, Injectable} from '@angular/core';
import {BehaviorSubject, Observable} from 'rxjs';
import {doc, Firestore, getDoc, setDoc} from '@angular/fire/firestore';
import {getValue, RemoteConfig} from '@angular/fire/remote-config';

export const USER_SYNC_COLLECTION = 'userSettings';
export const SYNC_CACHE_KEY_PREFIX = 'flickSync_';
/** A remote config flag, so sync can be switched off without a release. */
export const SYNC_ENABLED_KEY = 'userSyncEnabled';

/**
 * Reads are billed per document, so the whole account lives in one document that is fetched
 * at most once per this interval however many times the app is opened or reloaded.
 */
export const SYNC_READ_TTL_MS = 5 * 60 * 1000;
/** A settled preference is worth sending promptly; it happens rarely. */
export const SYNC_URGENT_DELAY_MS = 2000;
/** Study time accumulates continuously, so it is only sent on this cadence, or on the way out. */
export const SYNC_BACKGROUND_DELAY_MS = 15 * 60 * 1000;

export interface RemoteUserSettings {
    theme?: unknown;
    study?: {devices?: Record<string, unknown>};
}

interface CachedSettings {
    data: RemoteUserSettings;
    at: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

/** Deep merge, so a queued patch never discards another part of the document. */
function mergePatch(target: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
    for (const [key, value] of Object.entries(patch)) {
        const existing = target[key];
        target[key] = isRecord(value) && isRecord(existing)
            ? mergePatch({...existing}, value)
            : value;
    }
    return target;
}

/**
 * Keeps one document per account in step across devices, on a budget.
 *
 * There is no live listener: a listener bills a read for every change, and none of this needs
 * to arrive mid-session. Reads come from a cache that survives reloads, writes are merged and
 * sent on a delay, and anything unexpected turns sync off for the session rather than retrying.
 */
@Injectable({
    providedIn: 'root',
})
export class UserSyncService {
    private firestore = inject(Firestore);

    private readonly activeSubject = new BehaviorSubject<boolean>(false);
    /** True once the account document has actually been reached, so the app can say so. */
    readonly active$: Observable<boolean> = this.activeSubject.asObservable();

    private userId: string | null = null;
    private enabled = true;
    private pending: Record<string, unknown> = {};
    private timer: ReturnType<typeof setTimeout> | null = null;
    private dueAt = 0;

    constructor() {
        const remoteConfig = inject(RemoteConfig, {optional: true});
        if (remoteConfig) {
            try {
                const flag = getValue(remoteConfig, SYNC_ENABLED_KEY);
                // A static source means nothing has been published for the key, which must
                // leave sync on: the switch is there to turn it off, never to fail it closed.
                this.enabled = flag.getSource() === 'static' || flag.asBoolean();
            } catch {
                // Remote config is unavailable, so the switch simply does not apply.
            }
        }

        const flush = () => this.flush();
        window.addEventListener('pagehide', flush);
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') {
                this.flush();
            }
        });
        inject(DestroyRef).onDestroy(() => {
            window.removeEventListener('pagehide', flush);
            this.flush();
        });
    }

    attach(uid: string): void {
        if (this.userId !== uid) {
            this.flush();
            this.userId = uid;
        }
    }

    detach(): void {
        this.flush();
        this.userId = null;
        this.activeSubject.next(false);
    }

    private disable(): void {
        this.enabled = false;
        this.activeSubject.next(false);
    }

    /** The stored document, from the local cache when it is recent enough to trust. */
    async read(): Promise<RemoteUserSettings | null> {
        const uid = this.userId;
        if (!uid || !this.enabled) {
            return null;
        }
        const cached = this.readCache(uid);
        if (cached && Date.now() - cached.at < SYNC_READ_TTL_MS) {
            this.activeSubject.next(true);
            return cached.data;
        }
        try {
            const snapshot = await getDoc(doc(this.firestore, USER_SYNC_COLLECTION, uid));
            const data = (snapshot.data() ?? {}) as RemoteUserSettings;
            this.writeCache(uid, data);
            this.activeSubject.next(true);
            return data;
        } catch {
            this.disable();
            return cached?.data ?? null;
        }
    }

    /**
     * Merge a change into the document. `urgent` sends it in a couple of seconds; everything
     * else waits for the background cadence or for the page to go away.
     */
    queue(patch: Record<string, unknown>, urgent = false): void {
        if (!this.userId || !this.enabled) {
            return;
        }
        mergePatch(this.pending, patch);
        this.schedule(urgent ? SYNC_URGENT_DELAY_MS : SYNC_BACKGROUND_DELAY_MS);
    }

    flush(): void {
        this.clearTimer();
        const uid = this.userId;
        const patch = this.pending;
        this.pending = {};
        if (!uid || !this.enabled || !Object.keys(patch).length) {
            return;
        }
        this.mergeCache(uid, patch);
        setDoc(doc(this.firestore, USER_SYNC_COLLECTION, uid), patch, {merge: true})
            .catch(() => this.disable());
    }

    private schedule(delay: number): void {
        const due = Date.now() + delay;
        if (this.timer && this.dueAt <= due) {
            return;
        }
        this.clearTimer();
        this.dueAt = due;
        this.timer = setTimeout(() => this.flush(), delay);
    }

    private clearTimer(): void {
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
    }

    private cacheKey(uid: string): string {
        return SYNC_CACHE_KEY_PREFIX + uid;
    }

    private readCache(uid: string): CachedSettings | null {
        try {
            const raw = localStorage.getItem(this.cacheKey(uid));
            const parsed = raw ? JSON.parse(raw) as CachedSettings : null;
            return parsed && isRecord(parsed.data) ? parsed : null;
        } catch {
            return null;
        }
    }

    private writeCache(uid: string, data: RemoteUserSettings): void {
        try {
            localStorage.setItem(this.cacheKey(uid), JSON.stringify({data, at: Date.now()} as CachedSettings));
        } catch {
            // Without the cache every load costs one read, which is still affordable.
        }
    }

    /** Keep the cache in step with what was just sent, so the next read stays local. */
    private mergeCache(uid: string, patch: Record<string, unknown>): void {
        const cached = this.readCache(uid);
        const data = mergePatch({...(cached?.data ?? {})} as Record<string, unknown>, patch);
        this.writeCache(uid, data as RemoteUserSettings);
    }
}
