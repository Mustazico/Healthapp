import { DecimalPipe } from '@angular/common';
import { Component, inject, output, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { MatIconButton } from '@angular/material/button';
import { MatFormField, MatLabel, MatPrefix, MatSuffix } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { MatProgressBar } from '@angular/material/progress-bar';
import { catchError, debounceTime, distinctUntilChanged, map, of, startWith, switchMap } from 'rxjs';
import { FoodApi } from '../core/api';
import { Food } from '../core/models';

@Component({
  selector: 'app-food-picker',
  imports: [FormsModule, DecimalPipe, MatFormField, MatLabel, MatInput, MatIcon, MatIconButton, MatPrefix, MatSuffix, MatProgressBar],
  template: `
    <mat-form-field class="full" subscriptSizing="dynamic">
      <mat-icon matPrefix>search</mat-icon>
      <mat-label>Søk etter vare</mat-label>
      <input matInput name="q" autocomplete="off" [ngModel]="query()" (ngModelChange)="query.set($event)" />
      <button mat-icon-button matSuffix type="button" (click)="scan.emit()" aria-label="Skann strekkode">
        <mat-icon>qr_code_scanner</mat-icon>
      </button>
    </mat-form-field>

    @if (results() === undefined) {
      <mat-progress-bar mode="indeterminate" />
    } @else {
      <div class="list">
        @for (f of results(); track f.id) {
          <button type="button" class="list-item" (click)="picked.emit(f)">
            @if (f.imageUrl) {
              <img [src]="f.imageUrl" alt="" referrerpolicy="no-referrer" />
            }
            <span class="grow">
              <div class="title">{{ f.name }}</div>
              <div class="muted small">{{ f.brand ?? '' }}</div>
            </span>
            <span class="muted small">{{ f.per100g.kcal | number: '1.0-0' }} kcal/100 g</span>
          </button>
        } @empty {
          <p class="empty">
            @if (query()) {
              Ingen varer matcher «{{ query() }}». Prøv å skanne strekkoden.
            } @else {
              Ingen varer ennå. Skann en strekkode for å legge til den første.
            }
          </p>
        }
      </div>
    }
  `,
  styles: `
    .list { margin-top: 8px; }
  `,
})
export class FoodPicker {
  readonly picked = output<Food>();
  readonly scan = output<void>();

  private api = inject(FoodApi);
  protected readonly query = signal('');
  protected readonly results = toSignal(
    toObservable(this.query).pipe(
      debounceTime(250),
      map((q) => q.trim()),
      distinctUntilChanged(),
      switchMap((q) =>
        this.api.search(q).pipe(
          startWith(undefined),
          catchError(() => of([] as Food[])),
        ),
      ),
    ),
    { initialValue: undefined },
  );
}
