import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { ListPage } from './list.page';
import { ActivatedRoute } from '@angular/router';
import { ActivatedRouteStub } from '../../stubs';
import { ManService, ManServiceStub } from '../../man.service';
import { IonicModule } from '@ionic/angular';

describe('ListPage', () => {
    let component: ListPage;
    let fixture: ComponentFixture<ListPage>;

    beforeEach(waitForAsync(() => {
        TestBed.configureTestingModule({
    imports: [IonicModule.forRoot(), ListPage],
    providers: [
        { provide: ActivatedRoute, useValue: ActivatedRouteStub },
        { provide: ManService, useValue: ManServiceStub }
    ]
}).compileComponents();

        fixture = TestBed.createComponent(ListPage);
        component = fixture.componentInstance;
        fixture.detectChanges();
    }));

    it('should create', () => {
        expect(component).toBeTruthy();
    });
});
