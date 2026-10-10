const HOUR_MS = 3600000;

/** Local calendar date as YYYY-MM-DD, so a day turns where the reader lives, not at UTC. */
export function toDateKey(date: Date): string {
    return date.getFullYear()
        + '-' + String(date.getMonth() + 1).padStart(2, '0')
        + '-' + String(date.getDate()).padStart(2, '0');
}

/**
 * The study day a moment belongs to when the day begins at `resetHour` rather than midnight.
 * Winding the clock back by that many hours puts a late night on the day it belongs to.
 */
export function studyDayKey(at: number, resetHour: number): string {
    return toDateKey(new Date(at - resetHour * HOUR_MS));
}

/** When the study day after the one holding `at` begins. */
export function nextResetAt(at: number, resetHour: number): number {
    const shifted = new Date(at - resetHour * HOUR_MS);

    // Built from calendar fields rather than added milliseconds, so daylight saving cannot
    // drift the boundary by an hour.
    return new Date(shifted.getFullYear(), shifted.getMonth(), shifted.getDate() + 1, resetHour).getTime();
}
