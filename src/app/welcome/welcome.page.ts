import {ChangeDetectionStrategy, Component, inject, OnDestroy, OnInit, signal} from "@angular/core";
import {AlertController} from "@ionic/angular/alert-controller";
import {IonButton} from "@ionic/angular/ion-button";
import {IonCard} from "@ionic/angular/ion-card";
import {IonCardContent} from "@ionic/angular/ion-card-content";
import {IonCardHeader} from "@ionic/angular/ion-card-header";
import {IonCardTitle} from "@ionic/angular/ion-card-title";
import {IonContent} from "@ionic/angular/ion-content";
import {IonRouterLinkWithHref} from "@ionic/angular/ion-router-link";
import {IonText} from "@ionic/angular/ion-text";
import {LoadingController} from "@ionic/angular/loading-controller";
import {Router, RouterLink} from "@angular/router";
import {ManService} from "../man.service";
import {HttpErrorResponse} from "@angular/common/http";
import {Subscription} from "rxjs";
import {User} from "@angular/fire/auth";
import {AuthService} from "../auth.service";
import {ThemeMenuComponent} from "../shared/theme-menu.component";

type LoginOutcome =
  | { status: "success" }
  | { status: "error"; error: unknown }
  | { status: "timeout" }
  | { status: "cancelled" }
  | { status: "aborted" };

@Component({
  selector: "app-welcome",
  templateUrl: "./welcome.page.html",
  styleUrls: ["./welcome.page.scss"],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    IonContent,
    IonCard,
    IonCardHeader,
    IonCardTitle,
    IonCardContent,
    IonButton,
    IonText,
    ThemeMenuComponent,
    RouterLink, IonRouterLinkWithHref,
  ],
})
export class WelcomePage implements OnInit, OnDestroy {
  private router = inject(Router);
  private authService = inject(AuthService);
  private manService = inject(ManService);
  private loadingCtrl = inject(LoadingController);
  alertCtrl = inject(AlertController);

  private readonly SIGN_IN_TIMEOUT_MS = 20_000;
  private loginAbortController: AbortController | null = null;
  private activeLoginLoading: HTMLIonLoadingElement | null = null;

  authStateSubscription: Subscription;
  isAuthChecked = false;
  readonly isSigningIn = signal(false);
  readonly user = signal<User | null>(null);
  readonly isSafari =
    /Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent);
  readonly isIAB =
    /FBAN/.test(navigator.userAgent) ||
    /FBAV/.test(navigator.userAgent) ||
    /Line\//.test(navigator.userAgent);

  ngOnInit() {
    this.loadingCtrl
      .create({
        message: "Authenticating...",
        duration: 7000,
      })
      .then((loading) => {
        loading.present();
        this.authStateSubscription = this.authService.user.subscribe((user) => {
          this.user.set(user);
          if (user) {
            this.cancelLogin("auth-resolved");
            this.goToHome().then(() => {
              loading.dismiss().catch(() => {});
            });
          } else {
            this.isAuthChecked = false;
          }
          loading.dismiss().catch(() => {});
        });
      })
      .catch((e) => console.log("Reject", e));
  }

  ngOnDestroy() {
    this.authStateSubscription?.unsubscribe();
    this.cancelLogin("destroy");
  }

  async login() {
    if (this.isSigningIn()) {
      return;
    }

    const controller = new AbortController();
    const { signal: abortSignal } = controller;
    this.loginAbortController = controller;
    this.isSigningIn.set(true);

    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let result: LoginOutcome;

    try {
      // Trigger signIn() BEFORE any `await` so browsers keep the synchronous
      // user-gesture context and don't block or detach the OAuth pop-up.
      const rawSignInPromise = this.authService.signIn();

      let signInSettled = false;
      const signInOutcome: Promise<LoginOutcome> = rawSignInPromise
        .then(() => ({ status: "success" as const }))
        .catch((error: unknown) => ({ status: "error" as const, error }))
        .finally(() => {
          signInSettled = true;
        });

      const loading = await this.loadingCtrl.create({
        message:
          "Signing in... Make sure to allow pop-ups. Tap outside to cancel.",
        spinner: "crescent",
        backdropDismiss: true,
      });

      if (abortSignal.aborted) {
        return;
      }

      if (signInSettled) {
        result = await signInOutcome;
      } else {
        this.activeLoginLoading = loading;

        const timeoutOutcome = new Promise<LoginOutcome>((resolve) => {
          timeoutId = setTimeout(
            () => resolve({ status: "timeout" }),
            this.SIGN_IN_TIMEOUT_MS
          );
          abortSignal.addEventListener(
            "abort",
            () => {
              if (timeoutId !== null) {
                clearTimeout(timeoutId);
                timeoutId = null;
              }
            },
            { once: true }
          );
        });

        const abortOutcome = new Promise<LoginOutcome>((resolve) => {
          abortSignal.addEventListener(
            "abort",
            () => resolve({ status: "aborted" }),
            { once: true }
          );
        });

        const dismissOutcome: Promise<LoginOutcome> = loading
          .onDidDismiss()
          .then(({ role }) => ({
            status: role === "backdrop" ? "cancelled" : "aborted",
          }));

        await loading.present();

        if (abortSignal.aborted) {
          await loading.dismiss().catch(() => {});
          return;
        }

        result = await Promise.race([
          signInOutcome,
          timeoutOutcome,
          abortOutcome,
          dismissOutcome,
        ]);
      }
    } catch (error: unknown) {
      result = { status: "error", error };
    } finally {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      if (this.loginAbortController === controller) {
        await this.cancelLogin();
      }
    }

    if (result.status === "timeout") {
      await this.alertError(
        "Sign-In Timed Out",
        "Sign-in took too long or the pop-up was blocked. Please allow pop-ups and try again."
      );
    } else if (
      result.status === "error" &&
      !this.isPopupCancelError(result.error)
    ) {
      await this.alertError(
        "Login Failed",
        `Unable to sign in. Please try again. (${this.formatSignInError(result.error)})`
      );
    }
  }

  private async cancelLogin(role = "cleanup") {
    const controller = this.loginAbortController;
    this.loginAbortController = null;
    if (controller && !controller.signal.aborted) {
      controller.abort(role);
    }

    const loading = this.activeLoginLoading;
    this.activeLoginLoading = null;
    this.isSigningIn.set(false);

    if (loading) {
      await loading.dismiss(undefined, role).catch(() => {});
    }
  }

  private getErrorCode(error: unknown): string | undefined {
    if (typeof error === "object" && error !== null && "code" in error) {
      const { code } = error as { code?: unknown };
      return typeof code === "string" ? code : undefined;
    }
    return undefined;
  }

  private formatSignInError(error: unknown): string {
    const code = this.getErrorCode(error) ?? "unknown";
    if (error instanceof Error) {
      return `${code}: ${error.message}`;
    }
    if (typeof error === "object" && error !== null && "message" in error) {
      const { message } = error as { message?: unknown };
      if (typeof message === "string") {
        return `${code}: ${message}`;
      }
    }
    return `${code}: ${String(error)}`;
  }

  private isPopupCancelError(error: unknown): boolean {
    const code = this.getErrorCode(error);
    return (
      code === "auth/popup-closed-by-user" ||
      code === "auth/cancelled-popup-request"
    );
  }

  logout() {
    this.cancelLogin("logout");
    this.authService
      .signOut()
      .then()
      .catch((e) => console.log("Reject", e));
    this.isAuthChecked = false;
  }

  goToHome() {
    if (this.isAuthChecked) {
      return this.router.navigate(["/home"]);
    }
    const currentUser = this.user();
    if (!currentUser) {
      return Promise.resolve();
    }
    currentUser.getIdToken().then((idToken) => {
      this.manService.setIdToken(idToken);
      this.manService
        .checkAuthorization()
        .toPromise()
        .then(
          (result) => {
            if (result) {
              this.isAuthChecked = true;
              return this.router.navigate(["/home"]);
            }
          },
          (reason: HttpErrorResponse) => {
            if (reason instanceof ErrorEvent) {
              this.alertError(
                "Client Error",
                "Please check your network connection."
              );
            } else if (reason.status === 401) {
              this.alertError(
                "Unregistered!",
                "You are not allowed to access this website."
              );
            } else if ([500, 502, 503, 504].includes(reason.status)) {
              this.alertError("Server Error", "Please contact administrator.");
            } else {
              this.manService.changeEndpoint();
              this.alertError(
                "Connection Error",
                "Unable to reach server. You may try again."
              );
            }
          }
        );
    });
    return new Promise<void>((resolve) => resolve());
  }

  async alertError(header: string, message: string) {
    const alert = await this.alertCtrl.create({
      header,
      message,
      buttons: ["OK"],
    });

    await alert.present();
  }
}