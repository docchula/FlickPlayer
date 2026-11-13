import {AfterViewInit, Component, CUSTOM_ELEMENTS_SCHEMA, ElementRef, inject, OnDestroy, OnInit, ViewChild} from '@angular/core';
import {BehaviorSubject, combineLatest, EMPTY, fromEvent, merge, Observable, pairwise, startWith, Subject, takeUntil, throttleTime} from 'rxjs';
import {ActivatedRoute, Router} from '@angular/router';
import {CourseMembers, EvaluationRecord, Lecture, ManService} from '../../man.service';
import {first, map, switchMap} from 'rxjs/operators';
import '@videojs/html/video/player';
import '@videojs/html/video/skin';
import '@videojs/html/media/hlsjs-video';
import '@videojs/html/media/dash-video';
import '@videojs/html/media/youtube-video';
import {
    AlertController,
    IonBackButton,
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
    IonListHeader,
    IonProgressBar,
    IonRow,
    IonSearchbar,
    IonText,
    IonTitle,
    IonToolbar,
    ModalController,
} from '@ionic/angular';
import {DomSanitizer, Title} from '@angular/platform-browser';
import {PlayHistory} from '../../play-tracker.service';
import {addIcons} from "ionicons";
import {checkmarkOutline, closeOutline, documentAttachOutline, documentTextOutline, download, pauseCircleOutline} from "ionicons/icons";
import {ulid} from 'ulid';
import {AsyncPipe, DatePipe, DecimalPipe, NgClass} from '@angular/common';
import {ModalEvaluationComponent} from './modal-evaluation.component';
import {confirmAiDisclaimer, ModalDocumentComponent} from './modal-document.component';
import {PomodoroTimerComponent} from '../../shared/pomodoro-timer.component';
import {ThemeMenuComponent} from '../../shared/theme-menu.component';
import {Analytics, logEvent} from '@angular/fire/analytics';
import {ConsentService} from '../../consent.service';

const IS_SAFARI = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

@Component({
    selector: 'app-course',
    templateUrl: './course.page.html',
    styleUrls: ['./course.page.scss'],
    schemas: [CUSTOM_ELEMENTS_SCHEMA],
    imports: [
        IonHeader,
        IonToolbar,
        IonBackButton,
        IonButtons,
        IonTitle,
        IonContent,
        IonGrid,
        IonRow,
        IonCol,
        IonText,
        IonButton,
        IonCard,
        IonCardHeader,
        IonCardTitle,
        IonCardContent,
        IonList,
        IonListHeader,
        IonLabel,
        IonItem,
        IonIcon,
        IonSearchbar,
        ThemeMenuComponent,
        NgClass,
        IonProgressBar,
        AsyncPipe,
        DecimalPipe,
        DatePipe,
        PomodoroTimerComponent,
    ]
})
export class CoursePage implements OnInit, AfterViewInit, OnDestroy {
    private route = inject(ActivatedRoute);
    private router = inject(Router);
    private manService = inject(ManService);
    private alertController = inject(AlertController);
    private sanitizer = inject(DomSanitizer);
    private modalCtrl = inject(ModalController);
    private analytics = inject(Analytics);
    private consentService = inject(ConsentService);
    private titleService = inject(Title);
    private originalTitle = this.titleService.getTitle();

    @ViewChild('videoSkin') videoSkinElement!: ElementRef<HTMLElement>;
    @ViewChild('videoPlayer') videoPlayerElement!: ElementRef<HTMLElement>;
    readonly playbackRates = [0.75, 1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 3];
    // The current media element (replaces the v8 `Player` instance)
    media: HTMLMediaElement | null = null;
    private media$ = new BehaviorSubject<HTMLMediaElement | null>(null);
    private mediaListeners: AbortController | null = null;
    currentVideo!: Lecture;
    year: string | null = null;
    course: string | null = null;
    courseId: string | null = null;
    videoIdFromSearch: string | null = null;
    list$!: Observable<Lecture[]>;
    filteredList$!: Observable<Lecture[]>;
    courseProgress = {
        viewed: 0,
        duration: 0
    };
    searchQuery = '';
    searchQuery$ = new Subject<string>();
    isAndroid = /Android/i.test(navigator.userAgent);
    isIos = /iPad/i.test(navigator.userAgent) || /iPhone/i.test(navigator.userAgent);
    lastPlayedVideoKey: number | null = null;
    playLog: { startTime: number, endTime: number | null, playbackRate: number, createdAt: number, updatedAt: number }[] = [];
    progressTimedOut: string | null = null;
    progressNetworkError: boolean | null = null;
    sessionUid!: string; // Unique ID for session x video (new id for each video)
    stopPolling$ = new Subject<boolean>();
    isEvaluated = false;
    // Tells if the video should seek to last played position when loadedmetadata event is fired
    // This is to prevent seeking in case loadedmetadata event is fired not at the beginning of the session
    expectVideoTimeJump = false;

    pendingVideoToPlay: Lecture | null = null;
    isPlayerReady = false;

    constructor() {
        addIcons({ download, documentAttachOutline, documentTextOutline, checkmarkOutline, closeOutline, pauseCircleOutline });
    }

    ngOnInit() {
        // Read optional `video`/`v` query param set by global search or direct link
        this.videoIdFromSearch = this.route.snapshot.queryParamMap.get('video') || this.route.snapshot.queryParamMap.get('v');

        this.list$ = this.route.paramMap.pipe(
            first(),
            switchMap(s => {
                this.year = s.get('year');
                const courseParam = s.get('course');
                this.course = courseParam ? decodeURIComponent(courseParam) : null;
                this.courseId = s.get('id');
               if ((this.year && this.course) || this.courseId) {
                    return combineLatest([
                        this.manService.getVideosInCourse(this.year ?? '', this.course ?? '', this.courseId),
                        this.manService.getPlayRecord(this.year ?? '', this.course ?? '', this.courseId, this.stopPolling$).pipe(startWith(null)),
                    ]).pipe(map(([courseData, history]) => {
                        if (!courseData) {
                            return [];
                        }
                        this.year = courseData.category;
                        this.course = courseData.name;
                        this.titleService.setTitle(`${courseData.name} | ${this.originalTitle}`);
                        const videos = this.mergeVideoInfo(courseData.lectures, history?.records ?? {}, history?.evaluations ?? {});
                        // Auto-select video from global search / direct link
                        if (this.videoIdFromSearch) {
                            const target = videos.find(v => String(v.id) === this.videoIdFromSearch || v.title === this.videoIdFromSearch);
                            if (target) {
                                if (this.isPlayerReady) {
                                    setTimeout(() => this.viewVideo(target), 0);
                                } else {
                                    this.pendingVideoToPlay = target;
                                }
                                this.videoIdFromSearch = null;
                            }
                        }
                        return videos;
                    }));
                } else if (this.year) {
                    this.router.navigate(['home/' + this.year]);
                } else {
                    this.router.navigate(['home']);
                }
                return EMPTY;
            })
        );

        this.filteredList$ = combineLatest([this.list$, this.searchQuery$.pipe(startWith(''))]).pipe(
            map(([videos, query]) => this.filterVideos(videos, query))
        );
    }

    ngAfterViewInit() {
        this.isPlayerReady = true;
        if (this.pendingVideoToPlay) {
            this.viewVideo(this.pendingVideoToPlay);
            this.pendingVideoToPlay = null;
        }

        // Listen for video time updates. The media element changes when the video (or its engine) changes,
        // so follow it with switchMap.
        let lastUpdated = 0;
        const allUpdate$ = this.media$.pipe(
            switchMap(media => media
                ? merge(
                    fromEvent(media, 'timeupdate').pipe(throttleTime(2000)),
                    fromEvent(media, 'pause'),
                ).pipe(map(() => ({
                    currentTime: media.currentTime,
                    playbackRate: media.playbackRate,
                    isPaused: media.paused,
                    isSeeking: media.seeking,
                })))
                : EMPTY
            ),
            takeUntil(this.stopPolling$),
            pairwise(), // Groups pairs of consecutive emissions together
        );
        allUpdate$.subscribe(([previous, current]) => {
            const currentTimestamp = Date.now();
            // Update play log
            const lastLogKey = this.playLog.length - 1;
            const lastLog = this.playLog[lastLogKey] ?? null;
            if (current.isPaused) {
                if (lastLog && lastLog.endTime === null) {
                    lastLog.endTime = current.currentTime;
                    lastLog.updatedAt = currentTimestamp;
                    this.playLog[lastLogKey] = lastLog;
                }
                // Show evaluation modal when video is paused in the last 5% of the video
                if (!current.isSeeking && !this.currentVideo.is_evaluated && !this.isEvaluated && this.currentVideo.duration && (current.currentTime > this.currentVideo.duration * 0.95)) {
                    this.openEvaluationModal();
                    this.isEvaluated = true;
                }
            } else {
                if (!lastLog // New
                    || lastLog.endTime === null // Handle null case
                    || lastLog.playbackRate !== current.playbackRate // Playback rate changed
                    || (current.currentTime - lastLog.endTime > 10) // Seek to next position
                    || (lastLog.endTime - current.currentTime > 3) // Seek to previous position
                    || (currentTimestamp - lastLog.updatedAt > 5000) // Disrupted logging
                ) {
                    this.playLog.push({
                        startTime: current.currentTime,
                        endTime: current.currentTime,
                        playbackRate: current.playbackRate,
                        createdAt: currentTimestamp,
                        updatedAt: currentTimestamp,
                    });
                } else {
                    lastLog.endTime = current.currentTime;
                    lastLog.updatedAt = currentTimestamp;
                    this.playLog[lastLogKey] = lastLog;
                }
            }

            // Push to server
            if (current.currentTime !== previous.currentTime) {
                if (currentTimestamp - lastUpdated > 20000) {
                    // Save progress while playing every 20 seconds
                    lastUpdated = currentTimestamp;
                    this.updatePlayRecord();
                } else if (current.isPaused && !current.isSeeking) {
                    // Save progress when pause but not seeking
                    this.updatePlayRecord();
                }
            }
        });
    }

    ngOnDestroy() {
        this.stopPolling$.next(true);
        this.detachMedia();
        this.titleService.setTitle(this.originalTitle);
    }

    // Pick the media component for the source type. In v10 each engine is its own element.
    private createMedia(sources: Lecture['sources']): HTMLMediaElement {
        const type = (sources[0]?.type ?? '').toLowerCase();
        // The v10 elements implement the HTMLMediaElement API at runtime (the guide says every media
        // event and property still works), but their TypeScript types are adapters, hence `as unknown as`.
        let media: HTMLMediaElement;
        if (type === 'video/youtube') {
            media = document.createElement('youtube-video') as unknown as HTMLMediaElement;
            media.setAttribute('src', sources[0].src);
        } else if (type.startsWith('application/x-mpegurl') || type.startsWith('application/vnd.apple.mpegurl')) {
            media = document.createElement('hlsjs-video') as unknown as HTMLMediaElement;
            media.setAttribute('src', sources[0].src);
        } else if (type.startsWith('application/dash+xml')) {
            media = document.createElement('dash-video') as unknown as HTMLMediaElement;
            media.setAttribute('src', sources[0].src);
        } else {
            // Progressive files (MP4/WebM): <source> children give the browser its fallback choice
            media = document.createElement('video');
            for (const source of sources) {
                const el = document.createElement('source');
                el.src = source.src;
                el.type = source.type;
                media.appendChild(el);
            }
        }
        media.setAttribute('playsinline', '');
        media.setAttribute('preload', 'metadata'); // same as the v8 <video preload="metadata">
        return media;
    }

    private detachMedia() {
        this.mediaListeners?.abort();
        this.mediaListeners = null;
        if (this.media) {
            try {
                this.media.pause();
            } catch {
                // ignore
            }
            this.media.remove();
            this.media = null;
        }
        this.media$.next(null);
    }

    // Replace the media component and attach listeners. Listeners are added before the element is
    // inserted so that no early event is missed.
    private attachMedia(sources: Lecture['sources']) {
        this.detachMedia();
        if (sources.length === 0) {
            return;
        }
        const media = this.createMedia(sources);
        const abort = new AbortController();
        this.mediaListeners = abort;
        const opts = {signal: abort.signal};

        media.addEventListener('error', () => {
            // MEDIA_ERR_SRC_NOT_SUPPORTED
            if (media.error?.code === 4) {
                this.logMediaNotSupported(media.error.code, media.error.message);
            }
        }, opts);
        media.addEventListener('ended', () => {
            this.updatePlayRecord();
            if (!this.currentVideo.is_evaluated && !this.isEvaluated) {
                this.openEvaluationModal();
                this.isEvaluated = true;
            }
        }, opts);
        media.addEventListener('loadedmetadata', () => {
            if (!this.currentVideo.duration) {
                this.currentVideo.duration = media.duration;
            }
            // On video load, seek to last played position
            const endTime = this.currentVideo.history?.end_time;
            if (endTime
                && this.expectVideoTimeJump
                && (!this.currentVideo.duration || ((endTime / this.currentVideo.duration) < 0.995))) {
                media.currentTime = endTime;
            }
            this.expectVideoTimeJump = false;
        }, opts);

        this.media = media;
        // The skin follows whichever media is attached inside it
        this.videoSkinElement.nativeElement.appendChild(media);
        this.media$.next(media);
    }

    mergeVideoInfo(videos: CourseMembers, history: PlayHistory, evaluations: { [key: number]: EvaluationRecord }) {
        const progress = {
            viewed: 0,
            duration: 0
        };
        this.lastPlayedVideoKey = Object.values(history).map(h => h.video_id).sort((a, b) => {
            // force history[b].played_at to be a string
            // @ts-ignore
            return ('' + history[b].played_at).localeCompare(history[a].played_at);
        }).slice(0, 1)[0] ?? null;
       const videoInfo = Object.values(videos).map(lecture => {
            const lectureId = lecture.id;
            const lectureHistory = (lectureId !== undefined ? history[lectureId] : undefined)
                ?? (((lectureId !== undefined && lectureId in evaluations && lecture.duration) ? { // If evaluation exists, treat as watched
                    end_time: lecture.duration,
                    played_at: null,
                } : { end_time: null, played_at: null }) as unknown as PlayHistory[number]);
            lecture.history = lectureHistory;
            if (lecture.duration) {
                progress.duration -= -lecture.duration;
                if (lectureHistory.end_time) {
                    progress.viewed -= -lectureHistory.end_time;
                }
            }
            lecture.is_evaluated = lectureId !== undefined && evaluations[lectureId]?.type === 'end_play';
            return lecture;
        });
        this.courseProgress = progress;

        // For local courses, sort by title
        return videoInfo.find(v => v.sources.find(s => s.path?.includes('.m3u8')))
            ? videoInfo.sort((a, b) => a.title.localeCompare(b.title))
            : videoInfo;
    }

    filterVideos(videos: Lecture[], query: string): Lecture[] {
        if (!query.trim()) {
            return videos;
        }

        const lowerQuery = query.toLowerCase();
        return videos.filter(video =>
            video.title.toLowerCase().includes(lowerQuery) ||
            (video.lecturer && video.lecturer.toLowerCase().includes(lowerQuery))
        );
    }

    onSearchChange(event: Event) {
        const target = event.target as HTMLIonSearchbarElement;
        this.searchQuery = target.value ?? '';
        this.searchQuery$.next(this.searchQuery);
    }

    viewVideo(video: Lecture) {
        const allSources = video.sources;
        const probe = document.createElement('video');
        video.sources = allSources.filter(source => {
            if (source.type === 'video/youtube') {
                return true;
            } else if (IS_SAFARI
                && (source.type.startsWith('application/dash+xml') || source.type.startsWith('video/webm'))) {
                return false;
            }
            return probe.canPlayType(
                source.type.replace('application/dash+xml', 'video/mp4')
                    .replace('application/x-mpegURL', 'video/mp4')
            ) !== '';
        });
        if (video.sources.length === 0) {
            // Every source failed the codec support check; try H.264 anyway, as canPlayType can be unreliable.
            // As a last resort, offer all sources and let the player try them.
            const h264Sources = allSources.filter(source => /\b(avc[13]|h\.?264)\b/i.test(source.type));
            video.sources = h264Sources.length > 0 ? h264Sources : allSources;
        }
        this.currentVideo = video;
        this.expectVideoTimeJump = true;
        this.isEvaluated = false;
        this.sessionUid = ulid();
        this.playLog = [];
        this.attachMedia(video.sources);
        this.videoPlayerElement?.nativeElement.focus();
    }

    async setPlaybackSpeed() {
        const alert = await this.alertController.create({
            header: 'Please enter speed!',
            inputs: [
                {
                    name: 'speed',
                    type: 'number',
                    min: 0.5,
                    max: 8,
                    value: (this.media?.playbackRate ?? 1).toFixed(2)
                }
            ],
            buttons: [
                {
                    text: 'Cancel',
                    role: 'cancel',
                    cssClass: 'secondary'
                },
                {
                    text: 'Ok',
                    handler: (i) => {
                        if (i.speed > 0.3 && i.speed < 9) {
                            if (this.media) {
                                // Player state follows native media property writes
                                this.media.playbackRate = i.speed;
                            }
                            if (this.consentService.current === 'granted') {
                                logEvent(this.analytics, 'playback_speed_change', {speed: i.speed});
                            }
                        }
                    }
                }
            ]
        });

        await alert.present();
    }

    async openEvaluationModal() {
        const modal = await this.modalCtrl.create({
            component: ModalEvaluationComponent,
            componentProps: { video: this.currentVideo },
        });
        await modal.present();
    }

    async openDocumentModal() {
        if (!await confirmAiDisclaimer(this.alertController)) {
            return;
        }
        const modal = await this.modalCtrl.create({
            component: ModalDocumentComponent,
            cssClass: 'modal-document',
            componentProps: { video: this.currentVideo },
        });
        await modal.present();
        logEvent(this.analytics, 'view_transcript', {video_id: this.currentVideo.id, video_title: this.currentVideo.title});
    }

    preventMouseEvent($event: MouseEvent) {
        // Prevent right-click only if video is downloadable
        if (this.currentVideo?.sources?.filter(s => s.path?.endsWith('.mp4') || s.src?.endsWith('.mp4') || s.path?.endsWith('.webm')).length > 0) {
            $event.preventDefault();
        }
    }

    sanitize(url: string) {
        return this.sanitizer.bypassSecurityTrustUrl(url);
    }

    encodeURIComponent(url: string) {
        return encodeURIComponent(url);
    }

    protected getCurrentPlayTimeString() {
        const time = this.media?.currentTime ?? 0;
        const seconds = Math.floor(time % 60);
        const minutes = Math.floor(time % 3600 / 60);
        const hours = Math.floor(time / 3600);
        return String(hours).padStart(2, "0") + ':'
            + String(minutes).padStart(2, "0") + ':'
            + String(seconds).padStart(2, "0");
    }

    private logMediaNotSupported(code: number | null, message: string | null) {
        if (!this.currentVideo?.id) {
            return;
        }
        const sourceTypes = (this.currentVideo.sources ?? []).map(source => source.type);
        this.manService.logPlayerError(this.currentVideo.id, code, message, sourceTypes).subscribe();
    }

    protected updatePlayRecord() {
        if (!this.currentVideo?.id) {
            return;
        }
        const requestTime = Date.now();
        // Clean play log: remove unnecessary logs
        this.playLog = this.playLog.filter((log, i) => log.startTime !== log.endTime || i >= this.playLog.length - 1);
        this.manService.updatePlayRecord(
            this.sessionUid,
            this.currentVideo.id,
            this.media?.currentTime ?? 0,
            this.media?.playbackRate ?? 1,
            this.playLog,
        ).subscribe({
            next: () => {
                this.progressTimedOut = null;
                this.progressNetworkError = null;
                // Clear play log, except the last or new one
                this.playLog = this.playLog.filter((log, i) => log.updatedAt > requestTime || i >= this.playLog.length - 1);
            },
            error: e => {
                if (e.status === 0) {
                    this.progressNetworkError = true;
                } else {
                    this.progressTimedOut = this.getCurrentPlayTimeString();
                }
            },
        });
    }
}
