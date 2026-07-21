import {Component, inject, OnInit} from '@angular/core';
import {ActivatedRoute, Router, RouterLink} from '@angular/router';
import {EMPTY, Observable} from 'rxjs';
import {map, switchMap} from 'rxjs/operators';
import {ManService} from '../../man.service';
import {colorByFolderName, colorByFolderNamePink} from '../../../helpers';
import {ThemeService} from '../../theme.service';
import {addIcons} from 'ionicons';
import {heart, heartOutline} from 'ionicons/icons';
import {IonBackButton, IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonTitle, IonToolbar} from '@ionic/angular/standalone';
import {AsyncPipe, NgStyle} from '@angular/common';

@Component({
    selector: 'app-list',
    templateUrl: './list.page.html',
    styleUrls: ['./list.page.scss'],
    imports: [IonHeader, IonToolbar, RouterLink, IonBackButton, IonTitle, NgStyle, IonContent, IonList, IonItem, IonLabel, AsyncPipe, IonButtons, IonButton, IonIcon]
})
export class ListPage implements OnInit {
    private route = inject(ActivatedRoute);
    private router = inject(Router);
    private manService = inject(ManService);
    themeService = inject(ThemeService);

    year: string;
    list$: Observable<{ name: string, is_remote: boolean, id: number, link: string[] }[]>;

    constructor() {
        addIcons({heart, heartOutline});
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

    getYearColor(): string {
        return this.themeService.isPinkMode ? colorByFolderNamePink(this.year) : colorByFolderName(this.year);
    }

    togglePink() {
        this.themeService.toggle();
    }

    protected readonly colorByFolderName = colorByFolderName;
}
