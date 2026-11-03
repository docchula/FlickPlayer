import {LiveCaptionsPage} from './live-captions.page';

describe('LiveCaptionsPage.copyAddress', () => {
    it('copies the address of Chrome\'s accessibility settings', async () => {
        const writeText = spyOn(navigator.clipboard, 'writeText').and.returnValue(Promise.resolve());
        const page = new LiveCaptionsPage();

        await page.copyAddress();

        expect(writeText).toHaveBeenCalledWith('chrome://settings/accessibility');
        expect(page.copied()).toBeTrue();
    });

    it('says when the address could not be copied', async () => {
        spyOn(navigator.clipboard, 'writeText').and.returnValue(Promise.reject(new DOMException('', 'NotAllowedError')));
        const page = new LiveCaptionsPage();

        await page.copyAddress();

        expect(page.copied()).toBeFalse();
    });
});
