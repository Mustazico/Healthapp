import { DecimalPipe } from '@angular/common';
import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatFormField, MatHint, MatLabel, MatSuffix } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { MatProgressBar } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { firstValueFrom, of } from 'rxjs';
import { RecipeApi } from '../../core/api';
import { errorMessage } from '../../core/errors';
import { rawWeight, recipePer100g, recipeTotal } from '../../core/nutrition';
import { DecimalInput } from '../../shared/decimal-input';
import { EditableIngredient, IngredientEditor, toIngredientLike } from '../../shared/ingredient-editor';
import { NutrientGrid } from '../../shared/nutrient-grid';
import { PageHeader } from '../../shared/page-header';

@Component({
  selector: 'app-recipe-edit',
  imports: [
    FormsModule,
    DecimalPipe,
    PageHeader,
    IngredientEditor,
    NutrientGrid,
    DecimalInput,
    MatButton,
    MatIconButton,
    MatIcon,
    MatFormField,
    MatLabel,
    MatHint,
    MatSuffix,
    MatInput,
    MatProgressBar,
  ],
  template: `
    <div class="page">
      <app-page-header [title]="isNew() ? 'Ny oppskrift' : 'Rediger oppskrift'" [back]="true" fallback="/recipes">
        @if (!isNew()) {
          <button mat-icon-button type="button" (click)="remove()" aria-label="Slett oppskrift"><mat-icon>delete</mat-icon></button>
        }
      </app-page-header>

      @if (ready()) {
        <div class="stack">
          <mat-form-field>
            <mat-label>Navn på retten</mat-label>
            <input matInput name="name" [ngModel]="name()" (ngModelChange)="name.set($event)" maxlength="200" required />
          </mat-form-field>

          <section class="surface-card stack">
            <h2>Ingredienser</h2>
            <app-ingredient-editor [(ingredients)]="ingredients" />
          </section>

          <mat-form-field>
            <mat-label>Ferdig vekt på retten</mat-label>
            <input matInput appDecimal name="cooked" [ngModel]="cookedWeight()" (ngModelChange)="cookedWeight.set($event)" />
            <span matSuffix class="suffix">g</span>
            <mat-hint>Vei gryta uten gryte. Tom = sum av ingredienser ({{ raw() | number: '1.0-0' }} g).</mat-hint>
          </mat-form-field>

          <mat-form-field>
            <mat-label>Notater</mat-label>
            <textarea matInput name="notes" rows="3" [ngModel]="notes()" (ngModelChange)="notes.set($event)" maxlength="4000"></textarea>
          </mat-form-field>

          <h2>Hele retten</h2>
          <app-nutrient-grid [nutrients]="total()" />
          <h2>Per 100 g</h2>
          <app-nutrient-grid [nutrients]="per100()" />

          @if (!valid()) {
            <p class="muted small">Gi retten et navn og minst én ingrediens med mengde større enn 0.</p>
          }
          <button mat-flat-button class="save" type="button" [disabled]="!valid() || saving()" (click)="save()">Lagre oppskrift</button>
        </div>
      } @else if (recipe.error()) {
        <p class="error-text">Fant ikke oppskriften.</p>
      } @else {
        <mat-progress-bar mode="indeterminate" />
      }
    </div>
  `,
  styles: `
    .suffix { padding-right: 12px; }
    .save { height: 48px; }
  `,
})
export class RecipeEditPage {
  readonly id = input<string>();

  private api = inject(RecipeApi);
  private router = inject(Router);
  private snack = inject(MatSnackBar);

  protected readonly isNew = computed(() => !this.id());
  protected readonly recipe = rxResource({
    params: () => this.id(),
    stream: ({ params }) => (params ? this.api.get(Number(params)) : of(null)),
  });

  protected readonly name = signal('');
  protected readonly notes = signal<string | null>(null);
  protected readonly cookedWeight = signal<number | null>(null);
  protected readonly ingredients = signal<EditableIngredient[]>([]);
  protected readonly saving = signal(false);
  protected readonly ready = computed(() => this.isNew() || !!this.recipe.value());

  private readonly like = computed(() => toIngredientLike(this.ingredients()));
  protected readonly raw = computed(() => rawWeight(this.like()));
  protected readonly total = computed(() => recipeTotal(this.like()));
  protected readonly per100 = computed(() => recipePer100g(this.like(), this.cookedWeight()));
  protected readonly valid = computed(
    () => !!this.name().trim() && this.ingredients().length > 0 && this.ingredients().every((i) => (i.grams ?? 0) > 0),
  );

  constructor() {
    effect(() => {
      const r = this.recipe.value();
      if (!r) return;
      untracked(() => {
        this.name.set(r.name);
        this.notes.set(r.notes);
        this.cookedWeight.set(r.cookedWeightGrams);
        this.ingredients.set(r.ingredients.map((i) => ({ food: i.food, grams: i.grams })));
      });
    });
  }

  protected async save(): Promise<void> {
    const input = {
      name: this.name().trim(),
      notes: this.notes()?.trim() || null,
      cookedWeightGrams: this.cookedWeight() || null,
      ingredients: this.ingredients().map((i) => ({ foodId: i.food.id, grams: i.grams ?? 0 })),
    };
    this.saving.set(true);
    try {
      const id = this.id();
      await firstValueFrom(id ? this.api.update(Number(id), input) : this.api.create(input));
      this.snack.open('Oppskriften er lagret', undefined, { duration: 2000 });
      await this.router.navigate(['/recipes'], { replaceUrl: true });
    } catch (err) {
      this.snack.open(errorMessage(err), 'OK', { duration: 4000 });
    } finally {
      this.saving.set(false);
    }
  }

  protected async remove(): Promise<void> {
    const r = this.recipe.value();
    if (!r || !confirm(`Slette «${r.name}»? Oppskriften forsvinner for alle i husstanden.`)) return;
    try {
      await firstValueFrom(this.api.delete(r.id));
      await this.router.navigate(['/recipes'], { replaceUrl: true });
    } catch (err) {
      this.snack.open(errorMessage(err), 'OK', { duration: 4000 });
    }
  }
}
