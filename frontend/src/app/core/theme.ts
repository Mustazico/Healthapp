import { effect, Injectable, signal } from '@angular/core';

export type ThemeMode = 'system' | 'light' | 'dark';
const STORAGE_KEY = 'nutritrack.theme';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly mode = signal<ThemeMode>(this.read());
  private readonly media = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  private readonly systemDark = signal(this.media?.matches ?? false);

  constructor() {
    this.media?.addEventListener('change', (e) => this.systemDark.set(e.matches));

    effect(() => {
      const mode = this.mode();
      localStorage.setItem(STORAGE_KEY, mode);
      document.documentElement.style.colorScheme = mode === 'system' ? 'light dark' : mode;
      const dark = mode === 'dark' || (mode === 'system' && this.systemDark());
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#111318' : '#f9f9ff');
    });
  }

  /** True when the effective theme is dark; useful for canvas-based charts. */
  isDark(): boolean {
    const mode = this.mode();
    return mode === 'dark' || (mode === 'system' && this.systemDark());
  }

  private read(): ThemeMode {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  }
}
