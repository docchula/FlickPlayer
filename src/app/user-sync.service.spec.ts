import {TestBed} from '@angular/core/testing';
import {BehaviorSubject, of} from 'rxjs';
import {AuthService} from './auth.service';
import {ManService} from './man.service';
import {UserSyncService} from './user-sync.service';

describe('UserSyncService', () => {
    let idToken: BehaviorSubject<string | null>;
    let manService: jasmine.SpyObj<Pick<ManService, 'getUserSettings' | 'saveUserSettings'>>;
    let sync: UserSyncService;

    beforeEach(() => {
        localStorage.clear();
        idToken = new BehaviorSubject<string | null>(null);
        manService = jasmine.createSpyObj('ManService', ['getUserSettings', 'saveUserSettings']);
        manService.getUserSettings.and.returnValue(of({theme: {}}));

        TestBed.configureTestingModule({
            providers: [
                {provide: AuthService, useValue: {idToken}},
                {provide: ManService, useValue: manService},
            ],
        });
        sync = TestBed.inject(UserSyncService);
    });

    afterEach(() => localStorage.clear());

    it('waits for the ID token before asking FlickMan, so signing in does not switch sync off', async () => {
        sync.attach('user-1');
        const reading = sync.read();
        await Promise.resolve();
        expect(manService.getUserSettings).not.toHaveBeenCalled();

        idToken.next('token');

        expect(await reading).toEqual({theme: {}});
        expect(manService.getUserSettings).toHaveBeenCalledTimes(1);
    });

    it('drops a read still waiting for the token when the user signs out', async () => {
        sync.attach('user-1');
        const reading = sync.read();
        sync.detach();

        idToken.next('token');

        expect(await reading).toBeNull();
        expect(manService.getUserSettings).not.toHaveBeenCalled();
    });
});
