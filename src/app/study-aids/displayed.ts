import {NgZone} from '@angular/core';
import {Observable} from 'rxjs';

/**
 * Whether the element is laid out at all. The settings sheet switches a card off with CSS, and a
 * card that is switched off should cost the server nothing. Needs the element to be a block.
 */
export function displayed(element: HTMLElement, zone: NgZone): Observable<boolean> {
    return new Observable<boolean>(subscriber => {
        let shown = element.getClientRects().length > 0;
        subscriber.next(shown);
        // Resizes are frequent while a card's content changes, so only a change re-enters Angular.
        const observer = new ResizeObserver(() => {
            const now = element.getClientRects().length > 0;
            if (now !== shown) {
                shown = now;
                zone.run(() => subscriber.next(now));
            }
        });
        observer.observe(element);

        return () => observer.disconnect();
    });
}
