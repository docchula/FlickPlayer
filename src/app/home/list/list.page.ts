import { Component, inject, OnInit } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { EMPTY, Observable, Subject, of } from 'rxjs';
import { debounceTime, distinctUntilChanged, map, switchMap, tap } from 'rxjs/operators';
import { ManService, SearchVideoResult } from '../../man.service';
import { colorByFolderName } from '../../../helpers';
import {
    IonBackButton,
    IonContent,
    IonHeader,
    IonItem,
    IonLabel,
    IonList,
    IonListHeader,
    IonSearchbar,
    IonSpinner,
    IonTitle,
    IonToolbar
} from '@ionic/angular/standalone';
import { AsyncPipe, NgStyle } from '@angular/common';

export interface EnrichedSearchResult extends SearchVideoResult {
    courseName?: string;
    courseYear?: string;
}

@Component({
    selector: 'app-list',
    templateUrl: './list.page.html',
    styleUrls: ['./list.page.scss'],
    imports: [
        IonHeader, IonToolbar, RouterLink, IonBackButton, IonTitle, NgStyle,
        IonContent, IonList, IonListHeader, IonItem, IonLabel, AsyncPipe,
        IonSearchbar, IonSpinner,
    ]
})
export class ListPage implements OnInit {
    private route = inject(ActivatedRoute);
    private router = inject(Router);
    private manService = inject(ManService);

    year: string;
    groupedList$: Observable<{ year: string, courses: { name: string, is_remote: boolean, id: number, link: string[] }[] }[]>;

    searchQuery = '';
    searchResults$: Observable<EnrichedSearchResult[]> = of([]);
    isSearching = false;

    /** Map of course_id (string) → { name, year } built from video list */
    private courseLookup = new Map<string, { name: string; year: string }>();

    private searchInput$ = new Subject<string>();

    ngOnInit() {
        this.groupedList$ = this.route.paramMap.pipe(
            switchMap(s => {
                const year = s.get('year');
                this.year = year;
                if (!year) {
                    this.router.navigate(['home']);
                    return EMPTY;
                }
                return this.manService.getVideoList().pipe(map(list => {
                    // Build course lookup while we have the data
                    if (list?.years) {
                        this.courseLookup.clear();
                        for (const y of Object.keys(list.years)) {
                            for (const course of list.years[y]) {
                                this.courseLookup.set(String(course.id), { name: course.name, year: y });
                            }
                        }
                    }
                    const courses = list?.years[year]?.map(course => ({
                        ...course,
                        link: ['/', 'home', 'course', String(course.id)]
                    })) ?? [];
                    return this.groupByAcademicYear(courses);
                }));
            })
        );

        this.searchResults$ = this.searchInput$.pipe(
            debounceTime(300),
            distinctUntilChanged(),
            tap(() => this.isSearching = true),
            switchMap(query => {
                if (!query.trim()) {
                    this.isSearching = false;
                    return of([]);
                }
                return this.manService.searchVideos(query).pipe(
                    map(results => results.map(r => ({
                        ...r,
                        courseName: this.courseLookup.get(r.course_id)?.name,
                        courseYear: this.courseLookup.get(r.course_id)?.year,
                    })).filter(r => r.courseYear === this.year))
                );
            }),
            tap(() => this.isSearching = false),
        );
    }

    onSearchChange(event: Event) {
        const target = event.target as HTMLIonSearchbarElement;
        this.searchQuery = target.value ?? '';
        this.searchInput$.next(this.searchQuery);
    }

    goToVideo(result: SearchVideoResult) {
        this.router.navigate(['home', 'course', result.course_id], {
            queryParams: { video: result.id }
        });
    }

    formatDuration(seconds: number): string {
        if (!seconds) return '';
        const m = Math.floor(seconds / 60);
        if (m < 60) return `${m} min`;
        const h = Math.floor(m / 60);
        const rem = m % 60;
        return rem > 0 ? `${h}h ${rem}m` : `${h}h`;
    }

    protected readonly colorByFolderName = colorByFolderName;

    private groupByAcademicYear(courses: { name: string, is_remote: boolean, id: number, link: string[] }[]) {
        const groups = new Map<string, typeof courses>();
        for (const course of courses) {
            const match = course.name.match(/\((25\d{2})\)/);
            const yearKey = match ? match[1] : 'Miscellaneous';
            if (!groups.has(yearKey)) {
                groups.set(yearKey, []);
            }
            groups.get(yearKey).push(course);
        }
        // Sort year keys descending (numeric years first, 'Miscellaneous' last)
        const sortedKeys = Array.from(groups.keys()).sort((a, b) => {
            if (a === 'Miscellaneous') return 1;
            if (b === 'Miscellaneous') return -1;
            return Number(b) - Number(a);
        });
        return sortedKeys.map(year => ({ year, courses: groups.get(year) }));
    }
}
