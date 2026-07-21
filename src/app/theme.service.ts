import {Injectable} from '@angular/core';
import {BehaviorSubject} from 'rxjs';

@Injectable({
    providedIn: 'root',
})
export class ThemeService {
    private readonly STORAGE_KEY = 'pinkMode';
    private pinkMode = new BehaviorSubject<boolean>(this.loadPreference());

    isPinkMode$ = this.pinkMode.asObservable();

    constructor() {
        this.applyTheme(this.pinkMode.value);
    }

    toggle(): void {
        const newValue = !this.pinkMode.value;
        this.pinkMode.next(newValue);
        this.applyTheme(newValue);
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(newValue));
    }

    get isPinkMode(): boolean {
        return this.pinkMode.value;
    }

    private loadPreference(): boolean {
        try {
            return JSON.parse(localStorage.getItem(this.STORAGE_KEY)) === true;
        } catch {
            return false;
        }
    }

    private applyTheme(isPink: boolean): void {
        if (isPink) {
            document.body.classList.add('pink-theme');
        } else {
            document.body.classList.remove('pink-theme');
        }
    }
}
