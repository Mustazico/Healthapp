import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, input, output, signal } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatProgressSpinner } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import { FoodApi } from '../core/api';
import { errorMessage } from '../core/errors';
import { Food, FoodInput } from '../core/models';
import { blankFood, FoodForm } from './food-form';
import { FoodPicker } from './food-picker';
import { Scanner } from './scanner';

type State =
  | { kind: 'scanning' }
  | { kind: 'searching' }
  | { kind: 'manual' }
  | { kind: 'looking'; ean: string }
  | { kind: 'form'; ean: string; initial: FoodInput; missing: string[]; notice: string };

const SOURCE_NAMES: Record<string, string> = { Kassalapp: 'Kassalapp', OpenFoodFacts: 'Open Food Facts' };

/** Scan → look up → (optionally) create food. Emits the saved or existing food. */
@Component({
  selector: 'app-scan-flow',
  imports: [Scanner, FoodForm, FoodPicker, MatButton, MatIcon, MatProgressSpinner],
  template: `
    @if (allowAlternatives()) {
      <div class="alternatives">
        <button mat-button type="button" (click)="setMode('search')">Søk etter vare</button>
        <button mat-button type="button" (click)="setMode('manual')">Legg inn manuelt</button>
      </div>
    }
    @if (formState(); as s) {
      <div class="stack">
        <div class="notice row">
          <mat-icon>info</mat-icon>
          <span class="grow">{{ s.notice }}</span>
          <button mat-button type="button" (click)="rescan()">Skann på nytt</button>
        </div>
        <app-food-form
          [initial]="s.initial"
          [missing]="s.missing"
          [busy]="saving()"
          [primaryLabel]="primaryLabel()"
          [secondaryLabel]="secondaryLabel()"
          (saved)="save($event.input, !$event.secondary)"
        />
      </div>
    } @else if (state().kind === 'searching') {
      <app-food-picker (picked)="selectFood($event)" />
    } @else if (state().kind === 'manual') {
      <app-food-form
        [initial]="manualFood"
        [busy]="saving()"
        primaryLabel="Lagre og legg til"
        (saved)="save($event.input, true)"
      />
    } @else if (state().kind === 'looking') {
      <div class="center stack">
        <mat-spinner diameter="40" />
        <p>Slår opp strekkode…</p>
      </div>
    } @else {
      <app-scanner (detected)="lookup($event)" />
    }
  `,
  styles: `
    .center { align-items: center; padding: 48px 0; }
    .alternatives { display: flex; justify-content: center; gap: 8px; margin-bottom: 16px; }
    .notice {
      padding: 8px 12px;
      border-radius: 12px;
      background: var(--mat-sys-secondary-container);
      color: var(--mat-sys-on-secondary-container);
      flex-wrap: nowrap;
    }
    .grow { flex: 1; }
  `,
})
export class ScanFlow {
  readonly primaryLabel = input('Lagre og legg til');
  readonly secondaryLabel = input<string | null>('Bare lagre varen');
  readonly allowAlternatives = input(false);
  readonly done = output<{ food: Food; addToLog: boolean }>();

  private api = inject(FoodApi);
  private snack = inject(MatSnackBar);
  protected readonly state = signal<State>({ kind: 'scanning' });
  protected readonly saving = signal(false);
  protected readonly manualFood = blankFood();
  protected readonly formState = computed(() => {
    const s = this.state();
    return s.kind === 'form' ? s : null;
  });

  protected async lookup(ean: string): Promise<void> {
    this.state.set({ kind: 'looking', ean });
    try {
      const result = await firstValueFrom(this.api.lookup(ean));
      if (result.foodId) {
        this.done.emit({ food: await firstValueFrom(this.api.get(result.foodId)), addToLog: true });
        return;
      }
      const { missingNutrients, ...draft } = result.draft;
      const source = SOURCE_NAMES[draft.source] ?? draft.source;
      this.state.set({
        kind: 'form',
        ean,
        initial: draft,
        missing: missingNutrients,
        notice: missingNutrients.length
          ? `Fant «${draft.name}» hos ${source}, men noe næringsinnhold mangler.`
          : `Fant «${draft.name}» hos ${source}. Sjekk verdiene og lagre.`,
      });
    } catch (err) {
      if (err instanceof HttpErrorResponse && err.status === 404) {
        this.state.set({
          kind: 'form',
          ean,
          initial: blankFood(ean),
          missing: [],
          notice: 'Fant ikke varen. Fyll inn fra næringsdeklarasjonen på pakken.',
        });
      } else {
        this.snack.open(errorMessage(err), 'OK', { duration: 4000 });
        this.state.set({ kind: 'scanning' });
      }
    }
  }

  protected setMode(mode: 'search' | 'manual'): void {
    this.state.set(mode === 'search' ? { kind: 'searching' } : { kind: 'manual' });
  }

  protected selectFood(food: Food): void {
    this.done.emit({ food, addToLog: true });
  }

  protected async save(input: FoodInput, addToLog: boolean): Promise<void> {
    this.saving.set(true);
    try {
      const food = await firstValueFrom(this.api.create(input));
      this.done.emit({ food, addToLog });
    } catch (err) {
      // Someone else saved the same EAN in the meantime: use theirs.
      if (err instanceof HttpErrorResponse && err.status === 409 && err.error?.foodId) {
        this.done.emit({ food: await firstValueFrom(this.api.get(err.error.foodId)), addToLog });
      } else {
        this.snack.open(errorMessage(err), 'OK', { duration: 4000 });
      }
    } finally {
      this.saving.set(false);
    }
  }

  protected rescan(): void {
    this.state.set({ kind: 'scanning' });
  }
}
