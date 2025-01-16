import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { HomePage } from './home.page';
import { AngularFireAuth } from '@angular/fire/compat/auth';
import { FireAuthStub } from '../stubs';
import { ManService, ManServiceStub } from '../man.service';
import { RouterTestingModule } from '@angular/router/testing';
import { IonicModule } from '@ionic/angular/ionic-module';

describe('HomePage', () => {
    let component: HomePage;
    let fixture: ComponentFixture<HomePage>;

    beforeEach(waitForAsync(() => {
        TestBed.configureTestingModule({
    imports: [IonicModule.forRoot(), RouterTestingModule, HomePage],
    providers: [
        { provide: AngularFireAuth, useValue: FireAuthStub },
        { provide: ManService, useValue: ManServiceStub }
    ],
}).compileComponents();

        fixture = TestBed.createComponent(HomePage);
        component = fixture.componentInstance;
        fixture.detectChanges();
    }));

    it('should create', () => {
        expect(component).toBeTruthy();
    });
});
