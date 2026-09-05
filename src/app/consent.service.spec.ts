import {TestBed} from '@angular/core/testing';
import {ConsentService} from './consent.service';

describe('ConsentService', () => {
    let service: ConsentService;

    beforeEach(() => {
        localStorage.removeItem('analyticsConsent');
        TestBed.configureTestingModule({});
        service = TestBed.inject(ConsentService);
    });

    afterEach(() => {
        localStorage.removeItem('analyticsConsent');
    });

    it('defaults to unset when storage is empty', () => {
        expect(service.current).toBe('unset');
    });

    it('grant() updates current and status$, and persists to storage', () => {
        const emitted: string[] = [];
        service.status$.subscribe(status => emitted.push(status));

        service.grant();

        expect(service.current).toBe('granted');
        expect(emitted).toEqual(['unset', 'granted']);
        expect(localStorage.getItem('analyticsConsent')).toBe('granted');
    });

    it('deny() updates current and status$, and persists to storage', () => {
        service.deny();

        expect(service.current).toBe('denied');
        expect(localStorage.getItem('analyticsConsent')).toBe('denied');
    });

    it('reads a previously granted value back from storage on construction', () => {
        localStorage.setItem('analyticsConsent', 'granted');
        const fresh = new ConsentService();

        expect(fresh.current).toBe('granted');
    });

    it('falls back to unset for a garbage stored value', () => {
        localStorage.setItem('analyticsConsent', 'not-a-real-status');
        const fresh = new ConsentService();

        expect(fresh.current).toBe('unset');
    });

    it('swallows storage errors when persisting', () => {
        spyOn(localStorage, 'setItem').and.throwError('quota exceeded');

        expect(() => service.grant()).not.toThrow();
        expect(service.current).toBe('granted');
    });

    it('swallows storage errors when reading and falls back to unset', () => {
        spyOn(localStorage, 'getItem').and.throwError('storage disabled');

        const fresh = new ConsentService();

        expect(fresh.current).toBe('unset');
    });
});
