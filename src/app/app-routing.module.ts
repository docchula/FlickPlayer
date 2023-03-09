import { NgModule } from '@angular/core';
import { PreloadAllModules, RouterModule, Routes } from '@angular/router';
import {WelcomePage} from './welcome/welcome.page';
import {AuthGuard} from './auth/auth.guard';

const routes: Routes = [
  {path: '', component: WelcomePage},
  {path: 'home', loadChildren: () => import('./home/home.module').then( m => m.HomePageModule), canLoad: [AuthGuard]},
];

@NgModule({
  imports: [
    RouterModule.forRoot(routes, { preloadingStrategy: PreloadAllModules })
  ],
  exports: [RouterModule]
})
export class AppRoutingModule { }
