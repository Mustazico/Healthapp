import { DecimalPipe } from '@angular/common';
import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { MatChip, MatChipSet } from '@angular/material/chips';
import { MatFormField, MatLabel, MatSuffix } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { MatProgressBar } from '@angular/material/progress-bar';
import { MatOption, MatSelect } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { FoodApi, LogApi } from '../../core/api';
import { isIsoDate, todayIso } from '../../core/dates';
import { errorMessage } from '../../core/errors';
import { defaultMealForNow, isMeal, Meal, MEALS } from '../../core/models';
import { emptyNutrients, roundNutrients, scale } from '../../core/nutrition';
import { DecimalInput } from '../../shared/decimal-input';
import { NutrientGrid } from '../../shared/nutrient-grid';
import { PageHeader } from '../../shared/page-header';

@Component({
  selector: 'app-add-food',
  imports: [
    FormsModule,
    DecimalPipe,
    RouterLink,
    PageHeader,
    NutrientGrid,
    DecimalInput,
    MatButton,
    MatIcon,
    MatFormField,
    MatLabel,
    MatSuffix,
    MatInput,
    MatSelect,
    MatOption,
    MatChipSet,
    MatChip,
    MatProgressBar,
  ],
  template: `
    <div class="page">
      <app-page-header title="Legg til vare" [back]="true" />
      @if (food.value(); as f) {
        <div class="stack">
          <div class="product row">
            @if (f.imageUrl) {
              <img [src]="f.imageUrl" alt="" referrerpolicy="no-referrer" />
            }
            <div class="grow">
              <h2>{{ f.name }}</h2>
              <div class="muted">{{ f.brand ?? '' }} · {{ f.per100g.kcal | number: '1.0-0' }} kcal/100 g</div>
            </div>
            <a mat-button [routerLink]="['/foods', f.id]"><mat-icon>edit</mat-icon> Rediger</a>
          </div>

          <div class="fields">
            <mat-form-field>
              <mat-label>{{ amountMode() === 'count' ? 'Antall (stk)' : 'Mengde (g)' }}</mat-label>
              <input
                matInput
                appDecimal
                [ngModel]="amountMode() === 'count' ? countInput() : gramsInput()"
                (ngModelChange)="amountMode() === 'count' ? countInput.set($event) : gramsInput.set($event)"
              />
              <span matSuffix class="suffix">{{ amountMode() === 'count' ? 'stk' : 'g' }}</span>
            </mat-form-field>
            <mat-form-field>
              <mat-label>Måltid</mat-label>
              <mat-select [value]="meal()" (valueChange)="meal.set($event)">
                @for (m of meals; track m.key) {
                  <mat-option [value]="m.key">{{ m.label }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
          </div>

          @if (food.value()?.servingGrams; as serving) {
            <div class="mode-hint muted">
              {{ amountMode() === 'count' ? 'Du skriver antall porsjoner.' : 'Du skriver gram.' }}
              1 porsjon = {{ serving }} g.
            </div>
            <mat-chip-set aria-label="Hurtigvalg for mengde">
              <mat-chip (click)="amountMode.set('count')">Antall (stk)</mat-chip>
              <mat-chip (click)="amountMode.set('grams')">Mengde (g)</mat-chip>
              @for (option of quickAmounts(serving); track option.value) {
                <mat-chip (click)="amountMode.set('count'); countInput.set(option.value)">{{ option.label }}</mat-chip>
              }
            </mat-chip-set>
          } @else {
            <mat-chip-set aria-label="Hurtigvalg for mengde">
              @for (g of quickGrams(); track g.value) {
                <mat-chip (click)="amountMode.set('grams'); gramsInput.set(g.value)">{{ g.label }}</mat-chip>
              }
            </mat-chip-set>
          }

          <app-nutrient-grid [nutrients]="nutrients()" />

          <button mat-flat-button class="add" type="button" [disabled]="!valid() || saving()" (click)="add()">
            Legg til {{ nutrients().kcal | number: '1.0-0' }} kcal
          </button>
        </div>
      } @else if (food.error()) {
        <p class="error-text">Fant ikke varen.</p>
      } @else {
        <mat-progress-bar mode="indeterminate" />
      }
    </div>
  `,
  styles: `
    .product img { width: 64px; height: 64px; object-fit: contain; border-radius: 12px; background: #fff; }
    .grow { flex: 1; min-width: 0; }
    .fields { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .suffix { padding-right: 12px; }
    mat-chip { cursor: pointer; }
    .add { height: 48px; }
  `,
})
export class AddFoodPage {
  readonly id = input.required<string>();
  readonly date = input<string>();
  readonly mealParam = input<string>(undefined, { alias: 'meal' });

  private foodApi = inject(FoodApi);
  private logApi = inject(LogApi);
  private router = inject(Router);
  private snack = inject(MatSnackBar);

  protected readonly meals = MEALS;
  protected readonly food = rxResource({
    params: () => Number(this.id()),
    stream: ({ params }) => this.foodApi.get(params),
  });
  protected readonly amountMode = linkedSignal<'grams' | 'count'>(() => {
    const serving = this.food.value()?.servingGrams;
    return serving && serving > 0 ? 'count' : 'grams';
  });
  protected readonly gramsInput = linkedSignal<number | null>(() => this.food.value()?.servingGrams ?? 100);
  protected readonly countInput = linkedSignal<number | null>(() => {
    const serving = this.food.value()?.servingGrams;
    const grams = this.gramsInput() ?? 0;
    return serving && serving > 0 ? grams / serving : null;
  });
  protected readonly meal = linkedSignal<Meal>(() => {
    const m = this.mealParam();
    return isMeal(m) ? m : defaultMealForNow();
  });
  protected readonly saving = signal(false);

  protected readonly grams = computed(() => {
    const serving = this.food.value()?.servingGrams;
    if (this.amountMode() === 'count' && serving && serving > 0) {
      return (this.countInput() ?? 0) * serving;
    }
    return this.gramsInput() ?? 0;
  });

  protected readonly nutrients = computed(() => scale(this.food.value()?.per100g ?? emptyNutrients(), this.grams() ?? 0));
  protected readonly valid = computed(() => (this.grams() ?? 0) > 0);
  protected readonly quickGrams = computed(() => {
    const base = [50, 100, 150, 200].map((g) => ({ value: g, label: `${g} g` }));
    return base;
  });

  protected readonly quickAmounts = (serving: number) => [
    { value: 1, label: `1 porsjon (${serving} g)` },
    { value: 2, label: '2 porsjoner' },
    { value: 3, label: '3 porsjoner' },
    { value: 5, label: '5 porsjoner' },
  ];

  protected async add(): Promise<void> {
    const food = this.food.value();
    if (!food) return;
    const date = isIsoDate(this.date()) ? this.date()! : todayIso();
    this.saving.set(true);
    try {
      await firstValueFrom(
        this.logApi.create({
          date,
          meal: this.meal(),
          name: food.brand ? `${food.name} (${food.brand})` : food.name,
          grams: this.grams() ?? 0,
          nutrients: roundNutrients(this.nutrients(), 2),
          foodId: food.id,
          recipeId: null,
        }),
      );
      this.snack.open(`${food.name} lagt til`, undefined, { duration: 2000 });
      await this.router.navigate(['/'], { queryParams: date === todayIso() ? {} : { date } });
    } catch (err) {
      this.snack.open(errorMessage(err), 'OK', { duration: 4000 });
    } finally {
      this.saving.set(false);
    }
  }
}
