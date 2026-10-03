import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatIcon } from '@angular/material/icon';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { AuthService } from './core/auth';
import { ThemeService } from './core/theme';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, MatIcon],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  private auth = inject(AuthService);
  private router = inject(Router);

  private url = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );

  protected readonly showNav = computed(() => !!this.auth.user() && !this.url().startsWith('/login'));

  protected readonly nav = [
    { path: '/', icon: 'today', label: 'I dag', exact: true },
    { path: '/scan', icon: 'qr_code_scanner', label: 'Skann', exact: false },
    { path: '/recipes', icon: 'menu_book', label: 'Oppskrifter', exact: false },
    { path: '/stats', icon: 'insights', label: 'Statistikk', exact: false },
    { path: '/more', icon: 'more_horiz', label: 'Mer', exact: false },
  ];

  constructor() {
    inject(ThemeService);
  }
}
