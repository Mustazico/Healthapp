import { Location } from '@angular/common';
import { Component, inject, input } from '@angular/core';
import { MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { Router } from '@angular/router';

@Component({
  selector: 'app-page-header',
  imports: [MatIconButton, MatIcon],
  template: `
    <header class="page-header">
      @if (back()) {
        <button mat-icon-button type="button" (click)="goBack()" aria-label="Tilbake">
          <mat-icon>arrow_back</mat-icon>
        </button>
      }
      <h1>{{ title() }}</h1>
      <span class="spacer"></span>
      <ng-content />
    </header>
  `,
})
export class PageHeader {
  readonly title = input.required<string>();
  readonly back = input(false);
  readonly fallback = input('/');

  private location = inject(Location);
  private router = inject(Router);

  goBack(): void {
    // Opened directly (e.g. from the home screen) there is no in-app history to go back to.
    if (window.history.length > 1) this.location.back();
    else void this.router.navigateByUrl(this.fallback());
  }
}
