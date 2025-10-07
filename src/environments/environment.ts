// This file can be replaced during build by using the `fileReplacements` array.
// `ng build --prod` replaces `environment.ts` with `environment.prod.ts`.
// The list of file replacements can be found in `angular.json`.

export const environment = {
  production: false,
  firebase: {
    apiKey: 'AIzaSyChVnSa_0Lk0U4SvPi_yTmpzCC5W2CZqaI',
      authDomain: 'flick.docchula.com',
    databaseURL: 'https://keendev-flick-a.firebaseio.com',
    projectId: 'keendev-flick-a',
    storageBucket: 'keendev-flick-a.appspot.com',
    messagingSenderId: '1075695455520',
    appId: '1:1075695455520:web:43435b3067a0c1b0ba9b45',
    measurementId: 'G-NRVJNXG64Q'
  },
  defaultRemoteConfig: {
    manEndpoint: 'https://flick-man-cf.docchula.com/'
  }
};

/*
 * For easier debugging in development mode, you can import the following file
 * to ignore zone related error stack frames such as `zone.run`, `zoneDelegate.invokeTask`.
 *
 * This import should be commented out in production mode because it will have a negative impact
 * on performance if an error is thrown.
 */
// import 'zone.js/dist/zone-error';  // Included with Angular CLI.
