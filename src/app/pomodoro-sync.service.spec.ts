import {fakeAsync, flushMicrotasks, TestBed} from '@angular/core/testing';
import {BehaviorSubject, Subject} from 'rxjs';
import {AuthService} from './auth.service';
import {PomodoroPreferences, PomodoroService} from './pomodoro.service';
import {PomodoroSyncService} from './pomodoro-sync.service';
import {RemoteUserSettings, UserSyncService} from './user-sync.service';

describe('PomodoroSyncService', () => {
    const preferences: PomodoroPreferences = {
        durations: {studyMinutes: 25, breakMinutes: 5, longBreakMinutes: 15},
        sessionsBeforeLongBreak: 4,
    };
    let user: BehaviorSubject<{uid: string} | null>;
    let idToken: BehaviorSubject<string | null>;
    let changes: Subject<PomodoroPreferences>;
    let pomodoro: jasmine.SpyObj<Pick<PomodoroService, 'applyPreferences' | 'getPreferences'>>;
    let sync: jasmine.SpyObj<Pick<UserSyncService, 'attach' | 'detach' | 'read' | 'queue'>>;
    let remote: RemoteUserSettings | null;

    function signIn(uid = 'user-1'): void {
        user.next({uid});
        idToken.next('token-for-' + uid);
    }

    beforeEach(() => {
        user = new BehaviorSubject<{uid: string} | null>(null);
        idToken = new BehaviorSubject<string | null>(null);
        changes = new Subject<PomodoroPreferences>();
        remote = {};
        pomodoro = jasmine.createSpyObj('PomodoroService', ['applyPreferences', 'getPreferences'], {preferencesChanged$: changes});
        pomodoro.getPreferences.and.returnValue(preferences);
        sync = jasmine.createSpyObj('UserSyncService', ['attach', 'detach', 'read', 'queue']);
        sync.read.and.callFake(() => Promise.resolve(remote));

        TestBed.configureTestingModule({
            providers: [
                {provide: AuthService, useValue: {user, idToken}},
                {provide: PomodoroService, useValue: pomodoro},
                {provide: UserSyncService, useValue: sync},
            ],
        });
        TestBed.inject(PomodoroSyncService);
    });

    it('waits for the ID token before reading, so the first read cannot fail', () => {
        user.next({uid: 'user-1'});
        expect(sync.read).not.toHaveBeenCalled();

        idToken.next('token');

        expect(sync.attach).toHaveBeenCalledWith('user-1');
        expect(sync.read).toHaveBeenCalledTimes(1);
    });

    it('takes on the preferences another device saved', fakeAsync(() => {
        remote = {pomodoro: {sessionsBeforeLongBreak: 2}};

        signIn();
        flushMicrotasks();

        expect(pomodoro.applyPreferences).toHaveBeenCalledWith({sessionsBeforeLongBreak: 2});
        expect(sync.queue).not.toHaveBeenCalled();
    }));

    it('shares this device\'s preferences when none are stored yet', fakeAsync(() => {
        remote = {theme: {}};

        signIn();
        flushMicrotasks();

        expect(sync.queue).toHaveBeenCalledWith({pomodoro: preferences}, true);
        expect(pomodoro.applyPreferences).not.toHaveBeenCalled();
    }));

    it('changes nothing when the settings could not be read', fakeAsync(() => {
        remote = null;

        signIn();
        flushMicrotasks();

        expect(pomodoro.applyPreferences).not.toHaveBeenCalled();
        expect(sync.queue).not.toHaveBeenCalled();
    }));

    it('reads once per sign-in, not on every token refresh', () => {
        signIn();
        idToken.next('refreshed-token');

        expect(sync.read).toHaveBeenCalledTimes(1);
    });

    it('sends a change the reader makes soon', () => {
        signIn();

        changes.next(preferences);

        expect(sync.queue).toHaveBeenCalledWith({pomodoro: preferences}, true);
    });

    it('lets go of the account on sign-out', () => {
        signIn();

        user.next(null);
        idToken.next(null);

        expect(sync.detach).toHaveBeenCalledTimes(1);
    });
});
