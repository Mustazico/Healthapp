import { DecimalPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, output, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatFormField, MatLabel, MatPrefix, MatSuffix } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { MatProgressBar } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import { catchError, debounceTime, distinctUntilChanged, firstValueFrom, map, of, startWith, switchMap } from 'rxjs';
import { FoodApi } from '../core/api';
import { errorMessage } from '../core/errors';
import { Food, FoodInput, LookupResult } from '../core/models';
import { FoodForm } from './food-form';

const SOURCE_NAMES: Record<string, string> = { Matvaretabellen: 'Matvaretabellen', Kassalapp: 'Kassalapp' };

@Component({
  selector: 'app-food-picker',
  imports: [
    FormsModule,
    DecimalPipe,
    FoodForm,
    MatButton,
    MatFormField,
    MatLabel,
    MatInput,
    MatIcon,
    MatIconButton,
    MatPrefix,
    MatSuffix,
    MatProgressBar,
  ],
  template: `
    @if (draft(); as d) {
      <div class="stack">
        <div class="notice">
          <mat-icon>info</mat-icon>
          <span class="grow">Noe næringsinnhold mangler for «{{ d.initial.name }}». Fyll inn fra pakken.</span>
          <button mat-button type="button" (click)="draft.set(null)">Avbryt</button>
        </div>
        <app-food-form
          [initial]="d.initial"
          [missing]="d.missing"
          [busy]="busy()"
          primaryLabel="Lagre og velg"
          (saved)="saveDraft($event.input)"
        />
      </div>
    } @else {
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
                Ingen lagrede varer matcher «{{ query() }}».
              } @else {
                Ingen varer ennå. Søk eller skann en strekkode for å legge til den første.
              }
            </p>
          }
        </div>
      }

      @if (query().trim().length >= 2) {
        <h3 class="section">Nye varer fra Matvaretabellen og butikker</h3>
        @if (online() === undefined || busy()) {
          <mat-progress-bar mode="indeterminate" />
        } @else if (online() === null) {
          <p class="empty">Søket på nett feilet. Prøv igjen.</p>
        }
        <div class="list">
          @for (r of onlineResults(); track $index) {
            <button type="button" class="list-item" [disabled]="busy()" (click)="pickOnline(r)">
              @if (r.draft.imageUrl) {
                <img [src]="r.draft.imageUrl" alt="" referrerpolicy="no-referrer" />
              } @else {
                <mat-icon class="muted">{{ r.foodId ? 'check_circle' : 'add_circle_outline' }}</mat-icon>
              }
              <span class="grow">
                <div class="title">{{ r.draft.name }}</div>
                <div class="muted small">
                  {{ r.draft.brand ?? sourceName(r) }}
                  @if (needsInput(r)) {
                    · mangler næringsinnhold
                  }
                </div>
              </span>
              @if (!r.draft.missingNutrients.includes('kcal')) {
                <span class="muted small">{{ r.draft.per100g.kcal | number: '1.0-0' }} kcal/100 g</span>
              }
            </button>
          } @empty {
            @if (online()) {
              <p class="empty">Fant ingen nye varer for «{{ query().trim() }}».</p>
            }
          }
        </div>
      }
    }
  `,
  styles: `
    .list { margin-top: 8px; }
    .section { margin: 20px 0 4px; font: var(--mat-sys-title-small); }
    .notice {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      border-radius: 12px;
      background: var(--mat-sys-secondary-container);
      color: var(--mat-sys-on-secondary-container);
    }
    .grow { flex: 1; }
  `,
})
export class FoodPicker {
  readonly picked = output<Food>();
  readonly scan = output<void>();

  private api = inject(FoodApi);
  private snack = inject(MatSnackBar);
  protected readonly query = signal('');
  protected readonly busy = signal(false);
  protected readonly draft = signal<{ initial: FoodInput; missing: string[] } | null>(null);
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

  /** `undefined` while loading, `null` on error. */
  protected readonly online = toSignal(
    toObservable(this.query).pipe(
      // Longer debounce than the local search: Kassalapp is rate limited.
      debounceTime(500),
      map((q) => q.trim()),
      distinctUntilChanged(),
      switchMap((q) =>
        q.length < 2
          ? of([] as LookupResult[])
          : this.api.searchOnline(q).pipe(
              startWith(undefined),
              catchError(() => of(null)),
            ),
      ),
    ),
    { initialValue: [] as LookupResult[] | null | undefined },
  );

  /** Saved foods already listed above are left out. */
  protected readonly onlineResults = computed(() => {
    const local = new Set((this.results() ?? []).map((f) => f.id));
    return (this.online() ?? []).filter((r) => r.foodId === null || !local.has(r.foodId));
  });

  protected sourceName(r: LookupResult): string {
    return SOURCE_NAMES[r.draft.source] ?? r.draft.source;
  }

  /** Fiber is optional on Norwegian labels, so a missing value is saved as 0 instead of asking. */
  protected needsInput(r: LookupResult): boolean {
    return r.draft.missingNutrients.some((n) => n !== 'fiber');
  }

  protected async pickOnline(r: LookupResult): Promise<void> {
    if (r.foodId) {
      await this.run(async () => this.picked.emit(await firstValueFrom(this.api.get(r.foodId!))));
      return;
    }
    const { missingNutrients, ...input } = r.draft;
    if (this.needsInput(r)) {
      this.draft.set({ initial: input, missing: missingNutrients });
    } else {
      await this.create(input);
    }
  }

  protected async saveDraft(input: FoodInput): Promise<void> {
    if (await this.create(input)) this.draft.set(null);
  }

  private create(input: FoodInput): Promise<boolean> {
    return this.run(async () => {
      try {
        this.picked.emit(await firstValueFrom(this.api.create(input)));
      } catch (err) {
        // Already saved by someone else: use that one.
        if (err instanceof HttpErrorResponse && err.status === 409 && err.error?.foodId) {
          this.picked.emit(await firstValueFrom(this.api.get(err.error.foodId)));
        } else {
          throw err;
        }
      }
    });
  }

  private async run(action: () => Promise<void>): Promise<boolean> {
    if (this.busy()) return false;
    this.busy.set(true);
    try {
      await action();
      return true;
    } catch (err) {
      this.snack.open(errorMessage(err), 'OK', { duration: 4000 });
      return false;
    } finally {
      this.busy.set(false);
    }
  }
}
