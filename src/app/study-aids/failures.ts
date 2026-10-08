import {SaveFailure} from './study-aids.model';

/** What to tell an editor when FlickMan refuses a change, other than a conflict. */
export function describeFailure(failure: SaveFailure): string {
    switch (failure.kind) {
        case 'invalid': {
            const details = Object.values(failure.errors).flat();

            return details.length ? details.join(' ') : failure.message;
        }
        case 'forbidden':
            return 'This account is no longer allowed to do that.';
        case 'rate-limited':
            return 'Too many changes in a short time. Wait a minute, then try again.';
        case 'network':
            return 'Flick could not reach the server. Check your connection, then try again.';
        case 'conflict':
            return 'Someone else changed this at the same time. Reload it and try again.';
        default:
            return failure.message;
    }
}
