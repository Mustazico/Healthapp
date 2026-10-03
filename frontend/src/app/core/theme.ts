import { effect, Injectable, signal } from '@angular/core';

export type ThemeMode = 'system' | 'light' | 'dark';
export type ThemePalette = 'blue' | 'green' | 'orange';
const STORAGE_KEY = 'nutritrack.theme';
const PALETTE_KEY = 'nutritrack.theme.palette';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly mode = signal<ThemeMode>(this.readMode());
  readonly palette = signal<ThemePalette>(this.readPalette());
  private readonly media = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  private readonly systemDark = signal(this.media?.matches ?? false);

  constructor() {
    this.media?.addEventListener('change', (e) => this.systemDark.set(e.matches));

    effect(() => {
      const mode = this.mode();
      const palette = this.palette();
      const effectiveDark = mode === 'dark' || (mode === 'system' && this.systemDark());
      localStorage.setItem(STORAGE_KEY, mode);
      localStorage.setItem(PALETTE_KEY, palette);
      document.documentElement.dataset['theme'] = palette;
      document.documentElement.dataset['colorMode'] = effectiveDark ? 'dark' : 'light';
      document.documentElement.style.colorScheme = mode === 'system' ? 'light dark' : mode;
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', effectiveDark ? '#111318' : '#f9f9ff');
    });
  }

  /** True when the effective theme is dark; useful for canvas-based charts. */
  isDark(): boolean {
    const mode = this.mode();
    return mode === 'dark' || (mode === 'system' && this.systemDark());
  }

  setPalette(palette: ThemePalette): void {
    this.palette.set(palette);
  }

  private readMode(): ThemeMode {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  }

  private readPalette(): ThemePalette {
    const v = localStorage.getItem(PALETTE_KEY);
    if (v === 'green') return 'green';
    if (v === 'orange') return 'orange';
    return 'blue';
  }
}
