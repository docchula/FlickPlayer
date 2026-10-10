import {Component, inject, OnInit} from '@angular/core';
import {Observable, of, Subject, timer} from 'rxjs';
import {CourseListResponse, DocumentSearchHit, Lecture, ManService, SearchVideoResult} from '../man.service';
import {Router, RouterLink} from '@angular/router';
import {SettingsMenuComponent} from '../shared/settings-menu.component';
import {PomodoroTimerComponent} from '../shared/pomodoro-timer.component';
import {AuthService} from '../auth.service';
import {colorByFolderName, snippetToHtml} from '../../helpers';
import {addIcons} from "ionicons";
import {documentTextOutline, filmOutline, logOutOutline, playOutline, searchOutline} from "ionicons/icons";
import {catchError, debounce, distinctUntilChanged, map, switchMap, tap} from 'rxjs/operators';
import {
    AlertController,
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
    IonSegment,
    IonSegmentButton,
    IonSpinner,
    IonText,
    IonTitle,
    IonToolbar,
    ModalController,
} from '@ionic/angular';
import {AsyncPipe, DatePipe, NgStyle} from '@angular/common';
import {Analytics, logEvent} from '@angular/fire/analytics';
import {ConsentService} from '../consent.service';
import {confirmAiDisclaimer, ModalDocumentComponent} from './course/modal-document.component';

// `title` searches videos by title, lecturer or date; `content` searches the AI-generated transcript documents.
export type SearchMode = 'title' | 'content';

export interface EnrichedSearchResult extends SearchVideoResult {
    courseName?: string;
    courseYear?: string;
}

export interface EnrichedDocumentHit extends DocumentSearchHit {
    courseName?: string;
    courseYear?: string;
    snippetHtml: string;
}

export type SearchResults =
    | { mode: 'title', items: EnrichedSearchResult[], error?: boolean }
    | { mode: 'content', items: EnrichedDocumentHit[], error?: boolean };

@Component({
    selector: 'app-home',
    templateUrl: 'home.page.html',
    styleUrls: ['home.page.scss'],
    imports: [
        IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonIcon,
        SettingsMenuComponent, PomodoroTimerComponent,
        IonContent, IonGrid, IonRow, IonCol, IonCard, RouterLink, NgStyle,
        IonCardHeader, IonCardTitle, AsyncPipe, DatePipe, IonCardContent, IonItem,
        IonLabel, IonText, IonSpinner, IonSearchbar, IonList, IonSegment, IonSegmentButton,
    ]
})
export class HomePage implements OnInit {
    private manService = inject(ManService);
    private router = inject(Router);
    private authService = inject(AuthService);
    private analytics = inject(Analytics);
    private consentService = inject(ConsentService);
    private modalCtrl = inject(ModalController);
    private alertController = inject(AlertController);

    response$: Observable<CourseListResponse>;
    searchQuery = '';
    searchMode: SearchMode = 'title';
    // The mode switch is only shown while the search box is focused or holds a query
    searchFocused = false;
    searchResults$: Observable<SearchResults | null> = of(null);
    isSearching = false;

    /** Map of course_id (string) → { name, year } built from video list */
    private courseLookup = new Map<string, { name: string; year: string }>();

    private searchInput$ = new Subject<{ query: string, mode: SearchMode }>();

    constructor() {
        addIcons({documentTextOutline, filmOutline, logOutOutline, playOutline, searchOutline});
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
            // Content search is slower and rate-limited, so wait a little longer for the user to stop typing
            debounce(({mode}) => timer(mode === 'content' ? 600 : 300)),
            distinctUntilChanged((a, b) => a.query === b.query && a.mode === b.mode),
            tap(() => this.isSearching = true),
            switchMap(({query, mode}): Observable<SearchResults | null> => {
                if (!query.trim()) {
                    this.isSearching = false;
                    return of(null);
                }
                if (this.consentService.current === 'granted') {
                    logEvent(this.analytics, 'search', {search_term: query, search_mode: mode});
                }
                if (mode === 'content') {
                    return this.manService.searchDocuments(query).pipe(
                        map(hits => ({
                            mode,
                            items: hits.map(h => ({...h, ...this.courseInfo(h.course_id), snippetHtml: snippetToHtml(h.snippet)})),
                        })),
                        catchError(() => of({mode, items: [], error: true} as SearchResults)),
                    );
                }
                return this.manService.searchVideos(query).pipe(
                    map(results => ({mode, items: results.map(r => ({...r, ...this.courseInfo(r.course_id)}))})),
                    catchError(() => of({mode, items: [], error: true} as SearchResults)),
                );
            }),
            tap(() => this.isSearching = false),
        );
    }

    private courseInfo(courseId: string): { courseName?: string, courseYear?: string } {
        const course = this.courseLookup.get(String(courseId));
        return {courseName: course?.name, courseYear: course?.year};
    }

    onSearchChange(event: Event) {
        const target = event.target as HTMLIonSearchbarElement;
        this.searchQuery = target.value ?? '';
        this.searchInput$.next({query: this.searchQuery, mode: this.searchMode});
    }

    onSearchModeChange(mode: SearchMode) {
        this.searchMode = mode;
        this.searchInput$.next({query: this.searchQuery, mode});
    }

    goToVideo(result: SearchVideoResult | Pick<DocumentSearchHit, 'video_id' | 'course_id'>) {
        return this.router.navigate(['home', 'course', result.course_id], {
            queryParams: {video: 'video_id' in result ? result.video_id : result.id}
        });
    }

    async openDocument(hit: DocumentSearchHit) {
        if (!await confirmAiDisclaimer(this.alertController)) {
            return;
        }
        const modal = await this.modalCtrl.create({
            component: ModalDocumentComponent,
            cssClass: 'modal-document',
            componentProps: {
                video: {id: Number(hit.video_id), title: hit.title, lecturer: hit.lecturer.join(', ')},
                headingPath: hit.heading_path,
                showWatchButton: true,
            },
        });
        await modal.present();
        if (this.consentService.current === 'granted') {
            logEvent(this.analytics, 'view_transcript', {video_id: hit.video_id, video_title: hit.title, source: 'search'});
        }
        const {role} = await modal.onDidDismiss();
        if (role === 'watch') {
            await this.goToVideo(hit);
        }
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
