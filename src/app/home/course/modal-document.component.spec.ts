import {ApplicationRef} from '@angular/core';
import {ComponentFixture, TestBed} from '@angular/core/testing';
import {ModalController} from '@ionic/angular/standalone';
import {of} from 'rxjs';
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
