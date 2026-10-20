import {NgModule} from '@angular/core';
import {RouterModule, Routes} from '@angular/router';
import {WelcomePage} from './welcome/welcome.page';
import {SignedInPreloading} from './auth/signed-in-preloading';

const routes: Routes = [
  {path: '', component: WelcomePage},
  // No canLoad guard: the router would wait for sign-in before even downloading the module. Every route in it is
  // guarded by AuthGuard.canActivate (see HomeRoutingModule), so it now downloads while sign-in is restored.
  {path: 'home', loadChildren: () => import('./home/home.module').then( m => m.HomePageModule)},
  {path: 'privacy-policy', loadComponent: () => import('./privacy-policy/privacy-policy.page').then(m => m.PrivacyPolicyPage)},
];

@NgModule({
  imports: [
    RouterModule.forRoot(routes, { preloadingStrategy: SignedInPreloading })
  ],
  exports: [RouterModule]
})
export class AppRoutingModule { }
