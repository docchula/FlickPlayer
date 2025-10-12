import {AfterViewInit, Component, ElementRef, OnDestroy, OnInit, ViewChild} from '@angular/core';
import {combineLatest, EMPTY, fromEvent, mergeAll, Observable, of, pairwise, startWith, Subject, takeUntil, throttleTime} from 'rxjs';
import {ActivatedRoute, Router} from '@angular/router';
import {CourseMembers, EvaluationRecord, Lecture, ManService} from '../../man.service';
import {first, map, switchMap} from 'rxjs/operators';
import videojs from 'video.js';
import 'videojs-hotkeys';
import 'videojs-youtube';
import {
    AlertController,
    IonBackButton,
    IonButton,
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
} from '@ionic/angular/standalone';
import {DomSanitizer} from '@angular/platform-browser';
import {PlayHistory} from '../../play-tracker.service';
import {addIcons} from "ionicons";
import {checkmarkOutline, closeOutline, documentAttachOutline, download, pauseCircleOutline} from "ionicons/icons";
import type Player from 'video.js/dist/types/player';
import {ulid} from 'ulid';
import {AsyncPipe, DatePipe, DecimalPipe, NgClass} from '@angular/common';
import {ModalEvaluationComponent} from './modal-evaluation.component';

@Component({
    selector: 'app-course',
    templateUrl: './course.page.html',
    styleUrls: ['./course.page.scss'],
    imports: [
        IonHeader,
        IonToolbar,
        IonBackButton,
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
        NgClass,
        IonProgressBar,
        AsyncPipe,
        DecimalPipe,
        DatePipe,
    ]
})
export class CoursePage implements OnInit, AfterViewInit, OnDestroy {
    @ViewChild('videoPlayer') videoPlayerElement: ElementRef;
    videoPlayer: Player;
    currentVideo: Lecture;
    year: string;
    course: string;
    courseId?: string;
    list$: Observable<Lecture[]>;
    filteredList$: Observable<Lecture[]>;
    courseProgress = {
        viewed: 0,
        duration: 0
    };
    searchQuery = '';
    searchQuery$ = new Subject<string>();
    isAndroid = /Android/i.test(navigator.userAgent);
    isIos = /iPad/i.test(navigator.userAgent) || /iPhone/i.test(navigator.userAgent);
    lastPlayedVideoKey: number = null;
    playLog: { startTime: number, endTime: number | null, playbackRate: number, createdAt: number, updatedAt: number }[] = [];
    progressTimedOut: string | null;
    progressNetworkError: boolean | null;
    sessionUid: string; // Unique ID for session x video (new id for each video)
    stopPolling$ = new Subject<boolean>();
    isEvaluated = false;
    // Tells if the video should seek to last played position when loadedmetadata event is fired
    // This is to prevent seeking in case loadedmetadata event is fired not at the beginning of the session
    expectVideoTimeJump = false;

    constructor(private route: ActivatedRoute, private router: Router,
        private manService: ManService, private alertController: AlertController,
                private sanitizer: DomSanitizer, private modalCtrl: ModalController) {
        addIcons({ download, documentAttachOutline, checkmarkOutline, closeOutline, pauseCircleOutline });
    }

    ngOnInit() {
        this.list$ = this.route.paramMap.pipe(
            first(),
            switchMap(s => {
                this.year = s.get('year');
                this.course = s.get('course') ? decodeURIComponent(s.get('course')) : null;
                this.courseId = s.get('id');
                if ((this.year && this.course) || this.courseId) {
                    return combineLatest([
                        this.manService.getVideosInCourse(this.year, this.course, this.courseId),
                        this.manService.getPlayRecord(this.year, this.course, this.courseId, this.stopPolling$).pipe(startWith(null)),
                    ]).pipe(map(([courseData, history]) => {
                        if (!courseData) {
                            return [];
                        }
                        this.year = courseData.category;
                        this.course = courseData.name;
                        return this.mergeVideoInfo(courseData.lectures, history?.records ?? {}, history?.evaluations ?? {});
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
        this.videoPlayer = videojs(this.videoPlayerElement.nativeElement, {
            controlBar: {
                skipButtons: {
                    forward: 10,
                    backward: 10,
                }
            },
            html5: {
                vhs: {
                    cacheEncryptionKeys: true,
                },
            },
            techOrder: ['html5', 'youtube'],
        }, () => {
            // @ts-ignore
            this.videoPlayer.hotkeys({
                volumeStep: 0.1,
                seekStep: 10,
                enableModifiersForNumbers: false,
                enableVolumeScroll: false,
            });
            this.videoPlayer.on('ended', () => {
                this.updatePlayRecord();
                if (!this.currentVideo.is_evaluated && !this.isEvaluated) {
                    this.openEvaluationModal();
                    this.isEvaluated = true;
                }
            });
            this.videoPlayer.on('loadedmetadata', () => {
                if (!this.currentVideo.duration) {
                    this.currentVideo.duration = this.videoPlayer.duration();
                }
                // On video load, seek to last played position
                if (this.currentVideo.history.end_time
                    && this.expectVideoTimeJump
                    && (!this.currentVideo.duration || (((this.currentVideo.history.end_time ?? 0) / this.currentVideo.duration) < 0.995))) {
                    this.videoPlayer.currentTime(this.currentVideo.history.end_time);
                }
                this.expectVideoTimeJump = false;
            });

            // Listen for video time updates
            let lastUpdated = 0;
            const allUpdate$ = of(
                fromEvent(this.videoPlayer, 'timeupdate').pipe(throttleTime(2000)),
                fromEvent(this.videoPlayer, 'pause'),
            ).pipe(
                mergeAll(),
                takeUntil(this.stopPolling$),
                map(() => ({
                    currentTime: this.videoPlayer.currentTime(),
                    playbackRate: this.videoPlayer.playbackRate(),
                    isPaused: this.videoPlayer.paused(),
                    isSeeking: this.videoPlayer.seeking(),
                })),
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
        });
    }

    ngOnDestroy() {
        this.stopPolling$.next(true);
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
            lecture.history = history[lecture.id] ?? ((lecture.id in evaluations && lecture.duration) ? { // If evaluation exists, treat as watched
                end_time: lecture.duration,
                played_at: null,
            } : {end_time: null, played_at: null});
            if (lecture.duration) {
                progress.duration -= -lecture.duration;
                if (lecture.history.end_time) {
                    progress.viewed -= -lecture.history.end_time;
                }
            }
            lecture.is_evaluated = evaluations[lecture.id]?.type === 'end_play';
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

    onSearchChange(event: any) {
        this.searchQuery = event.detail.value ?? '';
        this.searchQuery$.next(this.searchQuery);
    }

    viewVideo(video: Lecture) {
        video.sources = video.sources.filter(source => {
            if (source.type === 'video/youtube') {
                return true;
            } else if (videojs.browser.IS_SAFARI
                && (source.type.startsWith('application/dash+xml') || source.type.startsWith('video/webm'))) {
                return false;
            } /* else if (/Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent) && source.type.startsWith('application/x-mpegURL')) {
                // Don't play HLS on Safari
                return false;
            } */
            return this.videoPlayerElement.nativeElement.canPlayType(
                source.type.replace('application/dash+xml', 'video/mp4')
                    .replace('application/x-mpegURL', 'video/mp4')
            ) !== '';
        });
        this.videoPlayer.src(video.sources);
        this.currentVideo = video;
        this.videoPlayerElement.nativeElement.focus();
        this.expectVideoTimeJump = true;
        this.isEvaluated = false;
        this.sessionUid = ulid();
        this.playLog = [];
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
                    value: this.videoPlayer.playbackRate().toFixed(2)
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
                            this.videoPlayer.playbackRate(i.speed);
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
            componentProps: {video: this.currentVideo},
        });
        await modal.present();
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
        const time = this.videoPlayer.currentTime();
        const seconds = Math.floor(time % 60);
        const minutes = Math.floor(time % 3600 / 60);
        const hours = Math.floor(time / 3600);
        return String(hours).padStart(2, "0") + ':'
            + String(minutes).padStart(2, "0") + ':'
            + String(seconds).padStart(2, "0");
    }

    protected updatePlayRecord() {
        const requestTime = Date.now();
        // Clean play log: remove unnecessary logs
        this.playLog = this.playLog.filter((log, i) => log.startTime !== log.endTime || i >= this.playLog.length - 1);
        this.manService.updatePlayRecord(
            this.sessionUid,
            this.currentVideo.id,
            this.videoPlayer.currentTime(),
            this.videoPlayer.playbackRate(),
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
