// This file is required by karma.conf.js and loads recursively all the .spec and framework files

import 'zone.js/dist/zone-testing';
import { getTestBed } from '@angular/core/testing';
import { BrowserModule, platformBrowser } from '@angular/platform-browser';

// First, initialize the Angular testing environment.
getTestBed().initTestEnvironment(
  BrowserModule,
  platformBrowser()
);
