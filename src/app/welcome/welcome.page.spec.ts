import {CUSTOM_ELEMENTS_SCHEMA} from '@angular/core';
import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';

import {WelcomePage} from './welcome.page';
import {RouterTestingModule} from '@angular/router/testing';
import {AngularFireAuth} from '@angular/fire/compat/auth';
import {FireAuthStub} from '../stubs';
import {ManService, ManServiceStub} from '../man.service';

describe('WelcomePage', () => {
    let component: WelcomePage;
    let fixture: ComponentFixture<WelcomePage>;

    beforeEach(waitForAsync(() => {
        TestBed.configureTestingModule({
    imports: [RouterTestingModule, WelcomePage],
    providers: [
        { provide: AngularFireAuth, useValue: FireAuthStub },
        { provide: ManService, useValue: ManServiceStub }
    ],
    schemas: [CUSTOM_ELEMENTS_SCHEMA]
}).compileComponents();
    }));

    beforeEach(() => {
        fixture = TestBed.createComponent(WelcomePage);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it('should create', () => {
        expect(component).toBeTruthy();
    });
});
