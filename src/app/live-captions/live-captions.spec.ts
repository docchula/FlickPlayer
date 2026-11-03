import {isGoogleChrome, liveCaptionComputer, UserAgentData} from './live-captions';

const chrome: UserAgentData = {brands: [{brand: 'Chromium', version: '141'}, {brand: 'Google Chrome', version: '141'}], mobile: false, platform: 'macOS'};
const safariOnMac = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15';
const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1';
const firefoxOnWindows = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:144.0) Gecko/20100101 Firefox/144.0';
const linux = 'Mozilla/5.0 (X11; Linux x86_64; rv:144.0) Gecko/20100101 Firefox/144.0';

describe('liveCaptionComputer', () => {
    it('finds a Mac or a Windows computer in any browser', () => {
        expect(liveCaptionComputer(chrome, safariOnMac, 0)).toBe('macOS');
        expect(liveCaptionComputer({...chrome, platform: 'Windows'}, firefoxOnWindows, 0)).toBe('Windows');
        expect(liveCaptionComputer(null, safariOnMac, 0)).toBe('macOS');
        expect(liveCaptionComputer(null, firefoxOnWindows, 0)).toBe('Windows');
    });

    it('is null on phones, iPads and Linux', () => {
        expect(liveCaptionComputer({...chrome, mobile: true, platform: 'Android'}, linux, 5)).toBeNull();
        expect(liveCaptionComputer(null, iphone, 5)).toBeNull();
        // An iPad asks for the Mac page but has a touch screen
        expect(liveCaptionComputer(null, safariOnMac, 5)).toBeNull();
        expect(liveCaptionComputer({...chrome, platform: 'Linux'}, linux, 0)).toBeNull();
        expect(liveCaptionComputer(null, linux, 0)).toBeNull();
    });
});

describe('isGoogleChrome', () => {
    it('is true for Google Chrome only', () => {
        expect(isGoogleChrome(chrome)).toBeTrue();
        expect(isGoogleChrome({...chrome, brands: [{brand: 'Chromium', version: '141'}, {brand: 'Microsoft Edge', version: '141'}]})).toBeFalse();
        expect(isGoogleChrome(null)).toBeFalse();
    });
});
