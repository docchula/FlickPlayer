import {ApplicationRef, Component} from '@angular/core';
import {ComponentFixture, TestBed} from '@angular/core/testing';
import {IonApp, ModalController, provideIonicAngular} from '@ionic/angular';
import {of} from 'rxjs';
import {delay} from 'rxjs/operators';
import {ModalDocumentComponent} from './modal-document.component';
import {ManService} from '../../man.service';

describe('ModalDocumentComponent', () => {
    let fixture: ComponentFixture<ModalDocumentComponent>;
    const document = '# Antibiotics\n\nIntro\n\n## Penicillin\n\nText\n\n## Mitral valve\n\nText';

    beforeEach(() => {
        TestBed.configureTestingModule({
            imports: [ModalDocumentComponent],
            providers: [
                {provide: ManService, useValue: {getVideo: () => of({id: 1, document})}},
                {provide: ModalController, useValue: {dismiss: jasmine.createSpy('dismiss')}},
            ],
        });
        fixture = TestBed.createComponent(ModalDocumentComponent);
        fixture.componentInstance.video = {id: 1, title: 'Antibiotics', lecturer: 'A'};
    });

    it('highlights the section from the search hit without changing it after rendering', async () => {
        fixture.componentInstance.headingPath = 'Antibiotics > Mitral Valve';

        // Throws ExpressionChangedAfterItHasBeenCheckedError (NG0100) if the highlight changes after the render
        // Like the app, run a full application tick, which also runs the afterNextRender callbacks
        fixture.autoDetectChanges();
        TestBed.inject(ApplicationRef).tick();
        await fixture.whenStable();
        TestBed.inject(ApplicationRef).tick();

        expect(fixture.componentInstance.activeHeading).toBe(2);
        expect(fixture.nativeElement.querySelector('.doc-outline a.active')?.textContent).toBe('Mitral valve');
    });

    it('highlights the first heading when there is no search hit', async () => {
        fixture.detectChanges();
        await fixture.whenStable();

        expect(fixture.componentInstance.activeHeading).toBe(0);
    });
});

@Component({selector: 'app-host', template: '<ion-app></ion-app>', imports: [IonApp]})
class HostComponent {}

const filler = Array.from({length: 40}, (_, i) => `Paragraph ${i} of filler text that takes some vertical room.`).join('\n\n');
const longDocument = `# Antibiotics\n\n${filler}\n\n## Penicillin\n\n${filler}\n\n## Mitral valve\n\n${filler}`;

// Presents the real modal, so scrolling depends on layout like in the app.
describe('ModalDocumentComponent presented', () => {
    // 0ms: the document renders while the modal is still hidden, before it is presented
    for (const ms of [0, 50, 400]) {
        it(`scrolls to the search hit section (response after ${ms}ms)`, async () => {
            TestBed.configureTestingModule({
                imports: [HostComponent],
                providers: [
                    provideIonicAngular(),
                    {provide: ManService, useValue: {getVideo: () => of({id: 1, document: longDocument}).pipe(delay(ms))}},
                ],
            });
            const host = TestBed.createComponent(HostComponent);
            host.autoDetectChanges();
            const modal = await TestBed.inject(ModalController).create({
                component: ModalDocumentComponent,
                componentProps: {video: {id: 1, title: 'Antibiotics', lecturer: 'A'}, headingPath: 'Antibiotics > Mitral valve'},
            });
            await modal.present();
            await new Promise(r => setTimeout(r, 1500));
            const content = modal.querySelector('ion-content');
            const scrollEl = await content.getScrollElement();
            const heading = Array.from(modal.querySelectorAll('h2')).find(h => h.textContent === 'Mitral valve');
            const headingTop = heading.getBoundingClientRect().top - scrollEl.getBoundingClientRect().top;
            expect(scrollEl.scrollTop).toBeGreaterThan(1000);
            expect(Math.abs(headingTop)).toBeLessThan(5);
            await modal.dismiss();
        });
    }
});
