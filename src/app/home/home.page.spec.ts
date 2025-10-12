import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { HomePage } from './home.page';
import { AngularFireAuth } from '@angular/fire/compat/auth';
import { FireAuthStub } from '../stubs';
import { ManService, ManServiceStub } from '../man.service';
import { IonicModule } from '@ionic/angular';
import { provideRouter } from '@angular/router';

describe('HomePage', () => {
    let component: HomePage;
    let fixture: ComponentFixture<HomePage>;

    beforeEach(waitForAsync(() => {
        TestBed.configureTestingModule({
    imports: [IonicModule.forRoot(), provideRouter, HomePage],
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
