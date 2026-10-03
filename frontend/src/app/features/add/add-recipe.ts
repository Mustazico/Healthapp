import { DecimalPipe } from '@angular/common';
import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { MatCheckbox } from '@angular/material/checkbox';
import { MatChip, MatChipSet } from '@angular/material/chips';
import { MatFormField, MatHint, MatLabel, MatSuffix } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatProgressBar } from '@angular/material/progress-bar';
import { MatOption, MatSelect } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { LogApi, RecipeApi } from '../../core/api';
import { isIsoDate, todayIso } from '../../core/dates';
import { errorMessage } from '../../core/errors';
import { defaultMealForNow, isMeal, Meal, MEALS, Recipe } from '../../core/models';
import { dishWeight, rawWeight, recipePer100g, recipePortion, recipeTotal, roundNutrients } from '../../core/nutrition';
import { DecimalInput } from '../../shared/decimal-input';
import { EditableIngredient, IngredientEditor, toIngredientLike } from '../../shared/ingredient-editor';
import { NutrientGrid } from '../../shared/nutrient-grid';
import { PageHeader } from '../../shared/page-header';

function toEditable(r: Recipe | undefined): EditableIngredient[] {
  return (r?.ingredients ?? []).map((i) => ({ food: i.food, grams: i.grams }));
}

@Component({
  selector: 'app-add-recipe',
  imports: [
    FormsModule,
    DecimalPipe,
    PageHeader,
    IngredientEditor,
    NutrientGrid,
    DecimalInput,
    MatButton,
    MatCheckbox,
    MatChipSet,
    MatChip,
    MatFormField,
    MatLabel,
    MatHint,
    MatSuffix,
    MatInput,
    MatSelect,
    MatOption,
    MatProgressBar,
  ],
  template: `
    <div class="page">
      <app-page-header [title]="recipe.value()?.name ?? 'Oppskrift'" [back]="true" />
      @if (recipe.value(); as r) {
        <div class="stack">
          <p class="muted">Juster ingrediensene for denne gangen – endringene gjelder bare dette måltidet med mindre du lagrer dem.</p>

          <section class="surface-card stack">
            <h2>Ingredienser</h2>
            <app-ingredient-editor [(ingredients)]="ingredients" />
          </section>

          <section class="surface-card stack">
            <h2>Porsjon</h2>
            <div class="fields">
              <mat-form-field>
                <mat-label>Ferdig vekt på retten</mat-label>
                <input matInput appDecimal name="cooked" [ngModel]="cookedWeight()" (ngModelChange)="cookedWeight.set($event)" [placeholder]="(raw() | number: '1.0-0') ?? ''" />
                <span matSuffix class="suffix">g</span>
                <mat-hint>Tom = sum ({{ raw() | number: '1.0-0' }} g)</mat-hint>
              </mat-form-field>
              <mat-form-field>
                <mat-label>Din porsjon</mat-label>
                <input matInput appDecimal name="portion" [ngModel]="portion()" (ngModelChange)="portion.set($event)" />
                <span matSuffix class="suffix">g</span>
              </mat-form-field>
            </div>
            <mat-chip-set>
              <mat-chip (click)="portion.set(round(weight() / 4))">¼ av retten</mat-chip>
              <mat-chip (click)="portion.set(round(weight() / 2))">½ av retten</mat-chip>
              <mat-chip (click)="portion.set(round(weight()))">Hele retten</mat-chip>
            </mat-chip-set>
            <mat-form-field>
              <mat-label>Måltid</mat-label>
              <mat-select [value]="meal()" (valueChange)="meal.set($event)">
                @for (m of meals; track m.key) {
                  <mat-option [value]="m.key">{{ m.label }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
          </section>

          <div class="muted small">
            Hele retten: {{ total().kcal | number: '1.0-0' }} kcal · Per 100 g: {{ per100().kcal | number: '1.0-0' }} kcal,
            {{ per100().protein | number: '1.0-1' }} g protein
          </div>
          <h2>Din porsjon</h2>
          <app-nutrient-grid [nutrients]="portionNutrients()" />

          @if (dirty()) {
            <mat-checkbox [checked]="saveChanges()" (change)="saveChanges.set($event.checked)">
              Lagre endringene i oppskriften
            </mat-checkbox>
          }
          @if (!valid()) {
            <p class="error-text small">Alle ingredienser og porsjonen må ha en mengde større enn 0.</p>
          }
          <button mat-flat-button class="add" type="button" [disabled]="!valid() || saving()" (click)="add(r)">
            Legg til {{ portionNutrients().kcal | number: '1.0-0' }} kcal
          </button>
        </div>
      } @else if (recipe.error()) {
        <p class="error-text">Fant ikke oppskriften.</p>
      } @else {
        <mat-progress-bar mode="indeterminate" />
      }
    </div>
  `,
  styles: `
    .fields { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .suffix { padding-right: 12px; }
    mat-chip { cursor: pointer; }
    .add { height: 48px; }
  `,
})
export class AddRecipePage {
  readonly id = input.required<string>();
  readonly date = input<string>();
  readonly mealParam = input<string>(undefined, { alias: 'meal' });

  private recipeApi = inject(RecipeApi);
  private logApi = inject(LogApi);
  private router = inject(Router);
  private snack = inject(MatSnackBar);

  protected readonly meals = MEALS;
  protected readonly round = Math.round;
  protected readonly recipe = rxResource({
    params: () => Number(this.id()),
    stream: ({ params }) => this.recipeApi.get(params),
  });

  protected readonly ingredients = linkedSignal(() => toEditable(this.recipe.value()));
  protected readonly cookedWeight = linkedSignal<number | null>(() => this.recipe.value()?.cookedWeightGrams ?? null);
  protected readonly portion = linkedSignal<number | null>(() => {
    const w = dishWeight(toIngredientLike(toEditable(this.recipe.value())), this.recipe.value()?.cookedWeightGrams);
    return w > 0 ? Math.round(Math.min(300, w)) : null;
  });
  protected readonly meal = linkedSignal<Meal>(() => {
    const m = this.mealParam();
    return isMeal(m) ? m : defaultMealForNow();
  });
  protected readonly saveChanges = signal(false);
  protected readonly saving = signal(false);

  private readonly like = computed(() => toIngredientLike(this.ingredients()));
  protected readonly raw = computed(() => rawWeight(this.like()));
  protected readonly weight = computed(() => dishWeight(this.like(), this.cookedWeight()));
  protected readonly total = computed(() => recipeTotal(this.like()));
  protected readonly per100 = computed(() => recipePer100g(this.like(), this.cookedWeight()));
  protected readonly portionNutrients = computed(() => recipePortion(this.like(), this.cookedWeight(), this.portion() ?? 0));

  protected readonly valid = computed(
    () => this.ingredients().length > 0 && this.ingredients().every((i) => (i.grams ?? 0) > 0) && (this.portion() ?? 0) > 0,
  );
  protected readonly dirty = computed(() => {
    const r = this.recipe.value();
    if (!r) return false;
    const now = JSON.stringify(this.ingredients().map((i) => [i.food.id, i.grams]));
    const before = JSON.stringify(r.ingredients.map((i) => [i.food.id, i.grams]));
    return now !== before || (this.cookedWeight() ?? null) !== (r.cookedWeightGrams ?? null);
  });

  protected async add(r: Recipe): Promise<void> {
    const date = isIsoDate(this.date()) ? this.date()! : todayIso();
    this.saving.set(true);
    try {
      if (this.saveChanges() && this.dirty()) {
        await firstValueFrom(
          this.recipeApi.update(r.id, {
            name: r.name,
            notes: r.notes,
            cookedWeightGrams: this.cookedWeight() || null,
            ingredients: this.ingredients().map((i) => ({ foodId: i.food.id, grams: i.grams ?? 0 })),
          }),
        );
      }
      await firstValueFrom(
        this.logApi.create({
          date,
          meal: this.meal(),
          name: r.name,
          grams: this.portion() ?? 0,
          nutrients: roundNutrients(this.portionNutrients(), 2),
          foodId: null,
          recipeId: r.id,
        }),
      );
      this.snack.open(`${r.name} lagt til`, undefined, { duration: 2000 });
      await this.router.navigate(['/'], { queryParams: date === todayIso() ? {} : { date } });
    } catch (err) {
      this.snack.open(errorMessage(err), 'OK', { duration: 4000 });
    } finally {
      this.saving.set(false);
    }
  }
}
