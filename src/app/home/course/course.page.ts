import {AfterViewInit, Component, ElementRef, OnInit, ViewChild, OnDestroy} from '@angular/core';
import {combineLatest, EMPTY, Observable, startWith, Subject} from 'rxjs';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {CourseMembers, Lecture, ManService} from '../../man.service';
import {map, switchMap} from 'rxjs/operators';
import videojs from 'video.js';
import 'videojs-hotkeys';
import 'videojs-youtube';
import { AlertController, IonHeader, IonToolbar, IonButtons, IonBackButton, IonTitle, IonContent, IonGrid, IonRow, IonCol, IonText, IonButton, IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonList, IonListHeader, IonLabel, IonItem, IonIcon, IonProgressBar } from '@ionic/angular/standalone';
import {DomSanitizer} from '@angular/platform-browser';
import {PlayHistory} from '../../play-tracker.service';
import {Analytics, logEvent} from '@angular/fire/analytics';
import {addIcons} from "ionicons";
import {checkmarkOutline, closeOutline, documentAttachOutline, download, pauseCircleOutline} from "ionicons/icons";
import type Player from 'video.js/dist/types/player';
import {ulid} from 'ulid';
import { NgClass, AsyncPipe, DecimalPipe, DatePipe } from '@angular/common';

@Component({
    selector: 'app-course',
    templateUrl: './course.page.html',
    styleUrls: ['./course.page.scss'],
    standalone: true,
    imports: [
        IonHeader,
        IonToolbar,
        IonButtons,
        RouterLink,
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
        NgClass,
        IonProgressBar,
        AsyncPipe,
        DecimalPipe,
        DatePipe,
    ],
})
export class CoursePage implements OnInit, AfterViewInit, OnDestroy {
    @ViewChild('videoPlayer') videoPlayerElement: ElementRef;
    videoPlayer: Player;
    currentVideo: Lecture;
    year: string;
    course: string;
    list$: Observable<Lecture[]>;
    courseProgress = {
        viewed: 0,
        duration: 0
    };
    isAndroid = /Android/i.test(navigator.userAgent);
    isIos = /iPad/i.test(navigator.userAgent) || /iPhone/i.test(navigator.userAgent);
    lastPlayedVideoKey: number = null;
    sessionUid: string; // Unique ID for session x video (new id for each video)
    stopPolling = new Subject<boolean>();

    constructor(private route: ActivatedRoute, private router: Router,
        private manService: ManService, private alertController: AlertController,
                private analytics: Analytics, private sanitizer: DomSanitizer) {
        addIcons({ download, documentAttachOutline, checkmarkOutline, closeOutline, pauseCircleOutline });
    }

    ngOnInit() {
        this.list$ = this.route.paramMap.pipe(
            switchMap(s => {
                this.year = s.get('year');
                this.course = s.get('course');
                if (this.year && this.course) {
                    return combineLatest([
                        this.manService.getVideosInCourse(this.year, this.course),
                        this.manService.getPlayRecord(this.year, this.course, this.stopPolling).pipe(startWith(null)),
                    ]).pipe(map(([videos, history]) => this.mergeVideoInfo(videos, history)));
                } else if (this.year) {
                    this.router.navigate(['home/' + this.year]);
                } else {
                    this.router.navigate(['home']);
                }
                return EMPTY;
            })
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
            techOrder: ['html5', 'youtube'],
        }, () => {
            // @ts-ignore
            this.videoPlayer.hotkeys({
                volumeStep: 0.1,
                seekStep: 10,
                enableModifiersForNumbers: false,
                enableVolumeScroll: false,
            });
            this.videoPlayer.on('pause', () => {
                if (!this.videoPlayer.seeking()) {
                    // is paused, not seeking
                    this.updatePlayRecord();
                }
            });
            this.videoPlayer.on('ended', () => this.updatePlayRecord());
            let lastUpdated = 0;
            this.videoPlayer.on('timeupdate', () => {
                // Update while playing every 20 seconds
                if (Date.now() - lastUpdated > 20000) {
                    lastUpdated = Date.now();
                    this.updatePlayRecord();
                }
            });
            this.videoPlayer.on('tracking:performance', (_e: never, data: never) => {
                console.log('performance');
                if (this.videoPlayer.currentTime() > 30) {
                    logEvent(this.analytics, 'video_performance', this.attachEventLabel(data, true));
                    this.updatePlayRecord();
                }
            });
            this.videoPlayer.on('loadedmetadata', () => {
                // On video load, seek to last played position
                if (this.currentVideo.history.end_time
                    && (!this.currentVideo.duration || (((this.currentVideo.history.end_time ?? 0) / this.currentVideo.duration) < 0.995))) {
                    this.videoPlayer.currentTime(this.currentVideo.history.end_time);
                }
            });
        });
    }

    ngOnDestroy() {
        this.stopPolling.next(true);
    }

    mergeVideoInfo(videos: CourseMembers, history: PlayHistory|null) {
        if (!history) {
            history = {};
        }
        const progress = {
            viewed: 0,
            duration: 0
        };
        this.lastPlayedVideoKey = Object.values(history).map(h => h.video_id).sort((a, b) => {
            // force history[b].updated_at to be a string
            // @ts-ignore
            return ('' + history[b].updated_at).localeCompare(history[a].updated_at);
        }).slice(0, 1)[0] ?? null;
        Object.keys(videos).forEach(lectureKey => {
            videos[lectureKey].history = history[videos[lectureKey].id] ?? { end_time: null, updated_at: null };
            if (videos[lectureKey].duration) {
                progress.duration -= -videos[lectureKey].duration;
                if (videos[lectureKey].history.end_time) {
                    progress.viewed -= -videos[lectureKey].history.end_time;
                }
            }
        });
        this.courseProgress = progress;
        return Object.values(videos);
    }

    viewVideo(video: Lecture) {
        video.sources = video.sources.filter(source => {
            if (source.type === 'video/youtube') {
                return true;
            } else if (videojs.browser.IS_SAFARI
                && (source.type.startsWith('application/dash+xml') || source.type.startsWith('video/webm'))) {
                return false;
            } else if (/Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent) && source.type.startsWith('application/x-mpegURL')) {
                // Don't play HLS on Safari
                return false;
            }
            return this.videoPlayerElement.nativeElement.canPlayType(
                source.type.replace('application/dash+xml', 'video/mp4')
                    .replace('application/x-mpegURL', 'video/mp4')
            ) !== '';
        });
        this.videoPlayer.src(video.sources);
        this.currentVideo = video;
        this.videoPlayerElement.nativeElement.focus();
        this.sessionUid = ulid();
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

    preventMouseEvent($event: MouseEvent) {
        // Prevent right-click only if video is downloadable
        if (this.currentVideo?.sources?.filter(s => s.path.endsWith('.mp4') || s.path.endsWith('.webm')).length > 0) {
            $event.preventDefault();
        }
    }

    sanitize(url: string) {
        return this.sanitizer.bypassSecurityTrustUrl(url);
    }

    encodeURIComponent(url: string) {
        return encodeURIComponent(url);
    }

    lectureById(index: number, lecture: Lecture) {
        return lecture.identifier;
    }

    protected attachEventLabel(data: object, isNonInteraction?: boolean) {
        return {
            ...data,
            event_label: this.currentVideo.identifier,
            non_interaction: isNonInteraction === true
        };
    }

    protected updatePlayRecord() {
        this.manService.updatePlayRecord(this.sessionUid, this.currentVideo.id, this.videoPlayer.currentTime(), this.videoPlayer.playbackRate()).subscribe();
    }
}
