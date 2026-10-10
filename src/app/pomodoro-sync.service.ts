import {inject, Injectable} from '@angular/core';
import {combineLatest} from 'rxjs';
import {AuthService} from './auth.service';
import {PomodoroService} from './pomodoro.service';
import {UserSyncService} from './user-sync.service';

/**
 * Keeps the Pomodoro preferences (durations and sessions before a long break) the same on every device
 * the reader signs in on. Signing in takes on what another device saved; a change made here is sent a
 * couple of seconds later.
 */
@Injectable({
    providedIn: 'root',
})
export class PomodoroSyncService {
    private pomodoro = inject(PomodoroService);
    private sync = inject(UserSyncService);
    private userId: string | null = null;

    constructor() {
        const authService = inject(AuthService);
        // ManService only has a token once idToken emits, and a read without one would switch sync off
        combineLatest([authService.user, authService.idToken]).subscribe(([user, idToken]) => {
            if (user?.uid && idToken) {
                if (this.userId !== user.uid) {
                    this.userId = user.uid;
                    this.sync.attach(user.uid);
                    void this.pull(user.uid);
                }
            } else if (!user && this.userId) {
                this.userId = null;
                this.sync.detach();
            }
        });
        this.pomodoro.preferencesChanged$.subscribe(preferences => this.sync.queue({pomodoro: preferences}, true));
    }

    private async pull(uid: string): Promise<void> {
        const remote = await this.sync.read();
        if (this.userId !== uid || !remote) {
            return;
        }
        if (remote.pomodoro) {
            this.pomodoro.applyPreferences(remote.pomodoro);
        } else {
            // The first device to sync shares what it has
            this.sync.queue({pomodoro: this.pomodoro.getPreferences()}, true);
        }
    }
}
