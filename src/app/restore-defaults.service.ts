import {Injectable} from '@angular/core';
import {Observable, Subject} from 'rxjs';

/**
 * The app-wide "Restore default settings". Each feature that keeps preferences listens and puts
 * its own back, so the button needs no knowledge of which features this build contains.
 */
@Injectable({
    providedIn: 'root',
})
export class RestoreDefaultsService {
    private readonly restoreSubject = new Subject<void>();
    readonly restore$: Observable<void> = this.restoreSubject.asObservable();

    restore(): void {
        this.restoreSubject.next();
    }
}
