import {Component, inject, OnInit} from '@angular/core';
import {ActivatedRoute, Router, RouterLink} from '@angular/router';
import {BehaviorSubject, combineLatest, concat, EMPTY, forkJoin, Observable, of} from 'rxjs';
import {catchError, map, switchMap} from 'rxjs/operators';
import {Lecture, ManService} from '../../man.service';
import {colorByFolderName} from '../../../helpers';
import {
    IonBackButton,
    IonContent,
    IonHeader,
    IonIcon,
    IonItem,
    IonItemDivider,
    IonLabel,
    IonList,
    IonNote,
    IonSearchbar,
    IonTitle,
    IonToolbar
} from '@ionic/angular/standalone';
import {AsyncPipe, NgStyle} from '@angular/common';
import {addIcons} from 'ionicons';
import {bookOutline, videocamOutline} from 'ionicons/icons';

export interface CourseWithVideos {
    id: number;
    name: string;
    is_remote: boolean;
    link: string[];
    videos: Lecture[];
}

export interface FilteredCourseResult {
    course: CourseWithVideos;
    isCourseMatch: boolean;
    matchingVideos: Lecture[];
}

@Component({
    selector: 'app-list',
    templateUrl: './list.page.html',
    styleUrls: ['./list.page.scss'],
    imports: [
        IonHeader, IonToolbar, RouterLink, IonBackButton, IonTitle, NgStyle,
        IonContent, IonList, IonItem, IonItemDivider, IonLabel, IonNote, IonIcon, IonSearchbar, AsyncPipe
    ]
})
export class ListPage implements OnInit {
    private route = inject(ActivatedRoute);
    private router = inject(Router);
    private manService = inject(ManService);

    year: string;
    coursesWithVideos$: Observable<CourseWithVideos[]>;
    filteredResults$: Observable<FilteredCourseResult[]>;
    searchQuery$ = new BehaviorSubject<string>('');
    searchQuery = '';

    constructor() {
        addIcons({ bookOutline, videocamOutline });
    }

    ngOnInit() {
        this.coursesWithVideos$ = this.route.paramMap.pipe(
            switchMap(s => {
                const year = s.get('year');
                this.year = year;
                if (!year) {
                    this.router.navigate(['home']);
                    return EMPTY;
                }
                return this.manService.getVideoList().pipe(
                    switchMap(list => {
                        const courses: CourseWithVideos[] = list?.years[year]?.map(course => ({
                            ...course,
                            link: ['/', 'home', 'course', String(course.id)],
                            videos: []
                        })) ?? [];

                        if (courses.length === 0) {
                            return of([]);
                        }

                        const requests = courses.map(course =>
                            this.manService.getVideosInCourse(year, course.name, String(course.id)).pipe(
                                map(res => {
                                    const videos: Lecture[] = res?.lectures ? Object.values(res.lectures) : [];
                                    return {
                                        ...course,
                                        videos
                                    };
                                }),
                                catchError(() => of({
                                    ...course,
                                    videos: []
                                }))
                            )
                        );

                        // Emit instant course list first (0ms lag), then emit videos when background fetch completes
                        return concat(
                            of(courses),
                            forkJoin(requests)
                        );
                    })
                );
            })
        );

        this.filteredResults$ = combineLatest([this.coursesWithVideos$, this.searchQuery$]).pipe(
            map(([courses, query]) => {
                if (!query || !query.trim()) {
                    return courses.map(course => ({
                        course,
                        isCourseMatch: true,
                        matchingVideos: []
                    }));
                }

                const q = query.toLowerCase().trim();
                const results: FilteredCourseResult[] = [];

                for (const course of courses) {
                    const isCourseMatch = course.name.toLowerCase().includes(q);
                    const matchingVideos = course.videos.filter(v =>
                        v.title.toLowerCase().includes(q) ||
                        (v.lecturer && v.lecturer.toLowerCase().includes(q))
                    );

                    if (isCourseMatch || matchingVideos.length > 0) {
                        results.push({
                            course,
                            isCourseMatch,
                            matchingVideos
                        });
                    }
                }

                return results;
            })
        );
    }

    onSearchChange(event: any) {
        this.searchQuery = event.detail.value || '';
        this.searchQuery$.next(this.searchQuery);
    }

    protected readonly colorByFolderName = colorByFolderName;
}
