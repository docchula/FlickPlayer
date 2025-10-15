import {Component, inject, OnInit} from '@angular/core';
import {ActivatedRoute, Router, RouterLink} from '@angular/router';
import {EMPTY, Observable} from 'rxjs';
import {map, switchMap} from 'rxjs/operators';
import {ManService} from '../../man.service';
import {colorByFolderName} from '../../../helpers';
import {IonBackButton, IonContent, IonHeader, IonItem, IonLabel, IonList, IonTitle, IonToolbar} from '@ionic/angular/standalone';
import {AsyncPipe, NgStyle} from '@angular/common';

@Component({
    selector: 'app-list',
    templateUrl: './list.page.html',
    styleUrls: ['./list.page.scss'],
    imports: [IonHeader, IonToolbar, RouterLink, IonBackButton, IonTitle, NgStyle, IonContent, IonList, IonItem, IonLabel, AsyncPipe]
})
export class ListPage implements OnInit {
    private route = inject(ActivatedRoute);
    private router = inject(Router);
    private manService = inject(ManService);

    year: string;
    list$: Observable<{ name: string, is_remote: boolean, id: number, link: string[] }[]>;

    ngOnInit() {
        this.list$ = this.route.paramMap.pipe(
            switchMap(s => {
                const year = s.get('year');
                this.year = year;
                if (!year) {
                    this.router.navigate(['home']);
                    return EMPTY;
                }
                return this.manService.getVideoList().pipe(map(list => {
                    return list?.years[year]?.map(course => ({
                        ...course,
                        link: ['/', 'home', 'course', String(course.id)]
                    })) ?? [];
                }));
            })
        );
    }

    protected readonly colorByFolderName = colorByFolderName;
}
