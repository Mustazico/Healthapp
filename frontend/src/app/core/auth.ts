import { HttpClient, HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, firstValueFrom, of, throwError } from 'rxjs';
import { Me } from './models';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private router = inject(Router);

  readonly user = signal<Me | null>(null);
  readonly providers = signal<{ google: boolean; dev: boolean }>({ google: false, dev: false });

  async load(): Promise<void> {
    const [me, providers] = await Promise.all([
      firstValueFrom(this.http.get<Me>('/api/me').pipe(catchError(() => of(null)))),
      firstValueFrom(this.http.get<{ google: boolean; dev: boolean }>('/auth/providers').pipe(catchError(() => of(null)))),
    ]);
    this.user.set(me);
    if (providers) this.providers.set(providers);
  }

  // Full-page navigation: the OAuth flow is handled by the backend.
  loginWithGoogle(returnUrl = '/'): void {
    window.location.href = `/auth/login?returnUrl=${encodeURIComponent(returnUrl)}`;
  }

  devLogin(email: string, returnUrl = '/'): void {
    window.location.href = `/auth/dev-login?email=${encodeURIComponent(email)}&returnUrl=${encodeURIComponent(returnUrl)}`;
  }

  async logout(): Promise<void> {
    await firstValueFrom(this.http.post('/auth/logout', null).pipe(catchError(() => of(null))));
    this.user.set(null);
    await this.router.navigateByUrl('/login');
  }

  handleUnauthorized(): void {
    this.user.set(null);
    void this.router.navigate(['/login']);
  }
}

export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  return auth.user() ? true : inject(Router).createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
};

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  return next(req).pipe(
    catchError((err: unknown) => {
      if (err instanceof HttpErrorResponse && err.status === 401 && req.url !== '/api/me') auth.handleUnauthorized();
      return throwError(() => err);
    }),
  );
};
