import { Component, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { MatFormField, MatLabel } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth';

@Component({
  selector: 'app-login',
  imports: [FormsModule, MatButton, MatIcon, MatFormField, MatLabel, MatInput],
  template: `
    <div class="wrap">
      <div class="logo"><mat-icon>eco</mat-icon></div>
      <h1>NutriTrack</h1>
      <p class="muted">Spor kalorier, protein og næring – sammen.</p>

      @if (error() === 'denied') {
        <p class="error-box">Denne Google-kontoen har ikke tilgang. Be administrator legge til e-postadressen din.</p>
      }

      @if (auth.providers().google) {
        <button mat-flat-button class="google" (click)="auth.loginWithGoogle(safeReturnUrl())">
          <mat-icon>login</mat-icon> Logg inn med Google
        </button>
      } @else if (!auth.providers().dev) {
        <p class="muted">Innlogging er ikke konfigurert på serveren.</p>
      }

      @if (auth.providers().dev) {
        <form class="dev" (ngSubmit)="auth.devLogin(devEmail(), safeReturnUrl())">
          <p class="muted small">Utviklingsinnlogging (kun lokalt)</p>
          <mat-form-field subscriptSizing="dynamic">
            <mat-label>E-post</mat-label>
            <input matInput name="email" type="email" [ngModel]="devEmail()" (ngModelChange)="devEmail.set($event)" />
          </mat-form-field>
          <button mat-stroked-button type="submit">Logg inn (dev)</button>
        </form>
      }
    </div>
  `,
  styles: `
    .wrap {
      min-height: 100dvh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 12px;
      padding: 24px;
      text-align: center;
      box-sizing: border-box;
    }
    .logo {
      width: 72px;
      height: 72px;
      border-radius: 24px;
      display: grid;
      place-items: center;
      background: var(--mat-sys-primary-container);
      color: var(--mat-sys-on-primary-container);
    }
    .logo mat-icon { font-size: 40px; width: 40px; height: 40px; }
    .google { margin-top: 16px; }
    .error-box {
      padding: 12px 16px;
      border-radius: 12px;
      background: var(--mat-sys-error-container);
      color: var(--mat-sys-on-error-container);
      max-width: 360px;
    }
    .dev { display: flex; flex-direction: column; gap: 8px; margin-top: 32px; width: 100%; max-width: 320px; }
  `,
})
export class LoginPage {
  readonly error = input<string>();
  readonly returnUrl = input<string>();

  protected readonly auth = inject(AuthService);
  protected readonly devEmail = signal('dev1@example.com');
  protected readonly safeReturnUrl = computed(() => {
    const url = this.returnUrl();
    return url && url.startsWith('/') && !url.startsWith('//') ? url : '/';
  });

  constructor() {
    if (this.auth.user()) void inject(Router).navigateByUrl('/');
  }
}
