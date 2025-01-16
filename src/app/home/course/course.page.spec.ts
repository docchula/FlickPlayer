import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { CoursePage } from './course.page';
import { AngularFireAuth } from '@angular/fire/compat/auth';
import { ActivatedRouteStub, FireAnalyticsStub, FireAuthStub } from '../../stubs';
import { ManService, ManServiceStub } from '../../man.service';
import { RouterTestingModule } from '@angular/router/testing';
import { AngularFireAnalytics } from '@angular/fire/compat/analytics';
import { ActivatedRoute } from '@angular/router';
import { IonicModule } from '@ionic/angular/ionic-module';

describe('CoursePage', () => {
    let component: CoursePage;
    let fixture: ComponentFixture<CoursePage>;

    beforeEach(waitForAsync(() => {
        TestBed.configureTestingModule({
    imports: [IonicModule.forRoot(), RouterTestingModule, CoursePage],
    providers: [
        { provide: ActivatedRoute, useValue: ActivatedRouteStub },
        { provide: AngularFireAnalytics, useValue: FireAnalyticsStub },
        { provide: AngularFireAuth, useValue: FireAuthStub },
        { provide: ManService, useValue: ManServiceStub },
    ]
}).compileComponents();

        fixture = TestBed.createComponent(CoursePage);
        component = fixture.componentInstance;
        fixture.detectChanges();
    }));

    it('should create', () => {
        expect(component).toBeTruthy();
    });
});
