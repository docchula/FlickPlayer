import {NgModule} from '@angular/core';
import {RouterModule, Routes} from '@angular/router';
import {AuthGuard} from '../auth/auth.guard';
import {HomePage} from './home.page';
import {ListPage} from './list/list.page';
import {CoursePage} from './course/course.page';

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
                path: ':year',
                component: ListPage
            },
            {
                path: ':year/:course',
                component: CoursePage
            },
            {
                path: ':year/:id/:course',
                component: CoursePage
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
