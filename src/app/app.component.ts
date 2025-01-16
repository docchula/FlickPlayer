import { Component } from '@angular/core';

import { Platform } from '@ionic/angular/standalone';

@Component({
    selector: 'app-root',
    templateUrl: 'app.component.html',
    styleUrls: ['app.component.scss'],
    standalone: false
})
export class AppComponent {
    constructor(
        private platform: Platform,
    ) {
        this.initializeApp();
    }

    initializeApp() {
        /* this.platform.ready().then(() => {
          this.statusBar.styleDefault();
          this.splashScreen.hide();
        }); */
    }
}
