import {Injectable} from '@angular/core';
import {BehaviorSubject} from 'rxjs';

export type ConsentStatus = 'granted' | 'denied' | 'unset';

const STORAGE_KEY = 'analyticsConsent';

@Injectable({
    providedIn: 'root',
})
export class ConsentService {
    private statusSubject = new BehaviorSubject<ConsentStatus>(this.readStored());
    status$ = this.statusSubject.asObservable();

    get current(): ConsentStatus {
        return this.statusSubject.value;
    }

    grant(): void {
        this.setStatus('granted');
    }

    deny(): void {
        this.setStatus('denied');
    }

    private setStatus(status: ConsentStatus): void {
        this.statusSubject.next(status);
        try {
            localStorage.setItem(STORAGE_KEY, status);
        } catch {
            // Ignore storage errors
        }
    }

    private readStored(): ConsentStatus {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            return raw === 'granted' || raw === 'denied' ? raw : 'unset';
        } catch {
            return 'unset';
        }
    }
}
