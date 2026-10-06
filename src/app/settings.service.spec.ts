import {TestBed} from '@angular/core/testing';
import {provideRouter} from '@angular/router';
import {SETTINGS_STORAGE_KEY, SettingsService} from './settings.service';
import {WIDGETS} from './settings/settings-presets';

/*
 * The switches in the settings sheet hide each widget through settings.scss, which the test
 * build loads as well. Each widget arrives in its own pull request, so this is what shows the
 * sheet still reaches every element it offers to hide, whichever order they are merged in.
 */
describe('SettingsService widget switches', () => {
    beforeEach(() => {
        localStorage.removeItem(SETTINGS_STORAGE_KEY);
        TestBed.configureTestingModule({providers: [provideRouter([])]});
    });

    afterEach(() => {
        localStorage.removeItem(SETTINGS_STORAGE_KEY);
        document.documentElement.removeAttribute('data-hidden');
    });

    for (const widget of WIDGETS) {
        for (const selector of widget.selectors) {
            it(`hides <${selector}> while "${widget.label}" is switched off`, () => {
                const service = TestBed.inject(SettingsService);
                const element = document.body.appendChild(document.createElement(selector));
                try {
                    service.setVisible(widget.key, false);
                    expect(getComputedStyle(element).display).toBe('none');

                    service.setVisible(widget.key, true);
                    expect(getComputedStyle(element).display).not.toBe('none');
                } finally {
                    element.remove();
                }
            });
        }
    }

    it('hides only the widget that was switched off', () => {
        const service = TestBed.inject(SettingsService);
        const elements = WIDGETS.map(widget => document.body.appendChild(document.createElement(widget.selectors[0])));
        try {
            service.setVisible(WIDGETS[0].key, false);
            elements.forEach((element, index) => {
                expect(getComputedStyle(element).display === 'none').toBe(index === 0);
            });
        } finally {
            elements.forEach(element => element.remove());
        }
    });
});
