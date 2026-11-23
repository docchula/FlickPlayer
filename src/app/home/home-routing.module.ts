import {NgModule} from '@angular/core';
import {RouterModule, Routes} from '@angular/router';
import {AuthGuard} from '../auth/auth.guard';
import {HomePage} from './home.page';
import {ListPage} from './list/list.page';

// The course page carries the video player (hls.js, dash.js, Video.js), which the course
// list does not need: load it on its own so /home can render without it.
const loadCoursePage = () => import('./course/course.page').then(m => m.CoursePage);

const routes: Routes = [
    {
        path: '',
        canActivate: [AuthGuard],
        children: [
            {
                path: '',
                component: HomePage
            },
            {
                path: 'course/:id',
                loadComponent: loadCoursePage
            },
            {
                path: ':year',
                component: ListPage
            },
            {
                path: ':year/:course',
                loadComponent: loadCoursePage
            },
            {
                path: ':year/:id/:course',
                loadComponent: loadCoursePage
            }
        ]
    }
];

@NgModule({
    imports: [RouterModule.forChild(routes)],
    exports: [RouterModule]
})
export class HomeRoutingModule {
}
