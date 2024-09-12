import {TestBed} from '@angular/core/testing';

import {ManService} from './man.service';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import {FireAuthStub, FireRemoteConfigStub} from './stubs';
import {AngularFireRemoteConfig} from '@angular/fire/compat/remote-config';
import {AngularFireAuth} from '@angular/fire/compat/auth';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';

describe('ManService', () => {
    beforeEach(() => TestBed.configureTestingModule({
    imports: [],
    providers: [
        { provide: AngularFireAuth, useValue: FireAuthStub },
        { provide: AngularFireRemoteConfig, useValue: FireRemoteConfigStub },
        provideHttpClient(withInterceptorsFromDi()),
        provideHttpClientTesting()
    ]
}));

    it('should be created', () => {
        const service: ManService = TestBed.get(ManService);
        expect(service).toBeTruthy();
    });
});
