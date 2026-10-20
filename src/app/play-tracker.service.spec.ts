import {TestBed} from '@angular/core/testing';
import {Auth, User} from '@angular/fire/auth';
import {of} from 'rxjs';
import {PlayTrackerService} from './play-tracker.service';

describe('PlayTrackerService', () => {
    let connect: jasmine.Spy;
    let service: PlayTrackerService;
    let listeners: ((data: object, metadata: object) => void)[];
    let echo: {
        connector: { options: { auth: { headers: { Authorization: string } } } },
        channel: jasmine.Spy,
        leaveChannel: jasmine.Spy,
    };
    const settle = () => new Promise(resolve => setTimeout(resolve));

    beforeEach(() => {
        listeners = [];
        echo = {
            connector: {options: {auth: {headers: {Authorization: ''}}}},
            channel: jasmine.createSpy('channel').and.returnValue({listen: (_event: string, handler: never) => listeners.push(handler)}),
            leaveChannel: jasmine.createSpy('leaveChannel'),
        };
        // The real connect() loads Pusher and opens a websocket to the production server
        connect = spyOn(PlayTrackerService.prototype as never, 'connect').and.returnValue(Promise.resolve(echo) as never);
        TestBed.configureTestingModule({providers: [{provide: Auth, useValue: {}}]});
        service = TestBed.inject(PlayTrackerService);
        service.idToken$ = of('token');
        service.user$ = of({email: 'student@docchula.com'} as User);
    });

    it('loads the websocket client only once updates are asked for', async () => {
        expect(connect).not.toHaveBeenCalled();

        service.retrieve().subscribe();
        await settle();

        expect(connect).toHaveBeenCalledTimes(1);
    });

    it("listens on the user's channel with their token and emits each updated play record", async () => {
        const records: unknown[] = [];
        service.retrieve().subscribe(record => records.push(record));
        await settle();

        expect(echo.connector.options.auth.headers.Authorization).toBe('Bearer token');
        expect(echo.channel).toHaveBeenCalledWith('user.student@docchula.com');
        listeners[0]({model: {video_id: 7, end_time: 30}}, {});
        expect(records).toEqual([{video_id: 7, end_time: 30}]);
    });

    it('leaves the channel when nobody needs the updates anymore', async () => {
        const subscription = service.retrieve().subscribe();
        await settle();

        subscription.unsubscribe();

        expect(echo.leaveChannel).toHaveBeenCalledWith('user.student@docchula.com');
    });

    it('completes without an error when the client cannot be loaded', async () => {
        connect.and.returnValue(Promise.reject(new Error('Failed to fetch dynamically imported module')) as never);
        let completed = false;
        let failed = false;
        service.retrieve().subscribe({complete: () => completed = true, error: () => failed = true});
        await settle();

        expect(completed).toBe(true);
        expect(failed).toBe(false);
    });
});
