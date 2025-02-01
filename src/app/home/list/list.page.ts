import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { EMPTY, Observable } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import { ManService } from '../../man.service';
import { colorByFolderName } from '../../../helpers';
import { IonHeader, IonToolbar, IonBackButton, IonTitle, IonContent, IonList, IonItem, IonLabel } from '@ionic/angular/standalone';
import { NgStyle, AsyncPipe } from '@angular/common';

@Component({
    selector: 'app-list',
    templateUrl: './list.page.html',
    styleUrls: ['./list.page.scss'],
    imports: [IonHeader, IonToolbar, RouterLink, IonBackButton, IonTitle, NgStyle, IonContent, IonList, IonItem, IonLabel, AsyncPipe]
})
export class ListPage implements OnInit {
    year: string;
    list$: Observable<{ name: string, is_remote: boolean, id: number, link: string[] }[]>;

    constructor(private route: ActivatedRoute, private router: Router, private manService: ManService) {
    }

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
