import {Component, inject, OnInit} from '@angular/core';
import {Observable, Subject, combineLatest, of} from 'rxjs';
import {CourseListResponse, Lecture, ManService, SearchVideoResult} from '../man.service';
import {Router, RouterLink} from '@angular/router';
import {AuthService} from '../auth.service';
import {colorByFolderName} from '../../helpers';
import {addIcons} from "ionicons";
import {logOutOutline, searchOutline} from "ionicons/icons";
import {debounceTime, distinctUntilChanged, map, switchMap, tap} from 'rxjs/operators';
import {
    IonButton,
    IonButtons,
    IonCard,
    IonCardContent,
    IonCardHeader,
    IonCardTitle,
    IonCol,
    IonContent,
    IonGrid,
    IonHeader,
    IonIcon,
    IonItem,
    IonLabel,
    IonList,
    IonRow,
    IonSearchbar,
    IonSpinner,
    IonText,
    IonTitle,
    IonToolbar,
} from '@ionic/angular/standalone';
import {AsyncPipe, NgStyle} from '@angular/common';

export interface EnrichedSearchResult extends SearchVideoResult {
    courseName?: string;
    courseYear?: string;
}

@Component({
    selector: 'app-home',
    templateUrl: 'home.page.html',
    styleUrls: ['home.page.scss'],
    imports: [
        IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonIcon,
        IonContent, IonGrid, IonRow, IonCol, IonCard, RouterLink, NgStyle,
        IonCardHeader, IonCardTitle, AsyncPipe, IonCardContent, IonItem,
        IonLabel, IonText, IonSpinner, IonSearchbar, IonList,
    ]
})
export class HomePage implements OnInit {
    private manService = inject(ManService);
    private router = inject(Router);
    private authService = inject(AuthService);

    response$: Observable<CourseListResponse>;
    searchQuery = '';
    searchResults$: Observable<EnrichedSearchResult[]> = of([]);
    isSearching = false;

    /** Map of course_id (string) → { name, year } built from video list */
    private courseLookup = new Map<string, { name: string; year: string }>();

    private searchInput$ = new Subject<string>();

    constructor() {
        addIcons({logOutOutline, searchOutline});
    }

    logout() {
        this.authService.signOut().then(() => {
            this.router.navigate(['/']);
        }).catch(e => console.log('Reject', e));
    }

    ngOnInit() {
        this.response$ = this.manService.getVideoList();

        // Build course lookup map once video list loads
        this.response$.subscribe(response => {
            if (!response?.years) return;
            this.courseLookup.clear();
            for (const year of Object.keys(response.years)) {
                for (const course of response.years[year]) {
                    this.courseLookup.set(String(course.id), {name: course.name, year});
                }
            }
        });

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
                    })))
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
            queryParams: {video: result.id}
        });
    }

    protected readonly colorByFolderName = colorByFolderName;
    protected readonly Object = Object;

    goToLastVideo(lastVideo: Lecture) {
        return this.router.navigate(['home', 'course', lastVideo.course.id]);
    }

    formatDuration(seconds: number): string {
        if (!seconds) return '';
        const m = Math.floor(seconds / 60);
        if (m < 60) return `${m} min`;
        const h = Math.floor(m / 60);
        const rem = m % 60;
        return rem > 0 ? `${h}h ${rem}m` : `${h}h`;
    }
}
