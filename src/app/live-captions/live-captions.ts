/*
 * No website can switch on Chrome's own Live Caption, so Flick links to a page of steps for turning it on.
 * Live Caption comes with Google Chrome on a computer only: not on iPad, iPhone or Android.
 */

export interface UserAgentData {
    brands: {brand: string, version: string}[];
    mobile: boolean;
    platform: string;
}

/** Chrome's settings page with Live Caption on it. Chrome lets no page open it, not even through a link. */
export const CHROME_ACCESSIBILITY_SETTINGS = 'chrome://settings/accessibility';

/** The computer this is, where Chrome's Live Caption can run, or null on a phone, an iPad or Linux. */
export function liveCaptionComputer(
    userAgentData = (navigator as Navigator & {userAgentData?: UserAgentData}).userAgentData,
    userAgent = navigator.userAgent,
    maxTouchPoints = navigator.maxTouchPoints,
): 'macOS' | 'Windows' | null {
    if (userAgentData) {
        return !userAgentData.mobile && (userAgentData.platform === 'macOS' || userAgentData.platform === 'Windows')
            ? userAgentData.platform
            : null;
    }
    // Safari and Firefox have no userAgentData. An iPad asks for the Mac page, but a Mac has no touch screen.
    if (/Macintosh/.test(userAgent) && maxTouchPoints <= 1) {
        return 'macOS';
    }
    return /Windows/.test(userAgent) ? 'Windows' : null;
}

export function isGoogleChrome(
    userAgentData = (navigator as Navigator & {userAgentData?: UserAgentData}).userAgentData,
): boolean {
    return !!userAgentData?.brands.some(brand => brand.brand === 'Google Chrome');
}
