import { DecimalPipe } from '@angular/common';
import { Component, inject, model } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormField, MatSuffix } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { Food } from '../core/models';
import { IngredientLike, scale } from '../core/nutrition';
import { DecimalInput } from './decimal-input';
import { openFoodPicker } from './food-picker-dialog';

export interface EditableIngredient {
  food: Food;
  grams: number | null;
}

export function toIngredientLike(list: EditableIngredient[]): IngredientLike[] {
  return list.map((i) => ({ grams: i.grams ?? 0, per100g: i.food.per100g }));
}

@Component({
  selector: 'app-ingredient-editor',
  imports: [FormsModule, DecimalPipe, MatButton, MatIconButton, MatIcon, MatFormField, MatInput, MatSuffix, DecimalInput],
  template: `
    @for (item of ingredients(); track $index; let i = $index) {
      <div class="ingredient">
        <div class="name">
          <div class="title">{{ item.food.name }}</div>
          <div class="muted small">
            {{ kcal(item) | number: '1.0-0' }} kcal
            @if (item.food.brand) {
              · {{ item.food.brand }}
            }
          </div>
        </div>
        <mat-form-field class="grams" subscriptSizing="dynamic">
          <input matInput appDecimal [name]="'g' + i" [ngModel]="item.grams" (ngModelChange)="setGrams(i, $event)" aria-label="Gram" />
          <span matSuffix class="suffix">g</span>
        </mat-form-field>
        <button mat-icon-button type="button" (click)="remove(i)" [attr.aria-label]="'Fjern ' + item.food.name">
          <mat-icon>close</mat-icon>
        </button>
      </div>
    } @empty {
      <p class="muted">Ingen ingredienser ennå.</p>
    }
    <button mat-stroked-button type="button" (click)="add()"><mat-icon>add</mat-icon> Legg til ingrediens</button>
  `,
  styles: `
    :host { display: flex; flex-direction: column; gap: 8px; }
    .ingredient { display: flex; align-items: center; gap: 8px; }
    .name { flex: 1; min-width: 0; }
    .title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .grams { width: 96px; }
    .suffix { padding-right: 12px; }
    button[mat-stroked-button] { align-self: flex-start; }
  `,
})
export class IngredientEditor {
  readonly ingredients = model.required<EditableIngredient[]>();
  private dialog = inject(MatDialog);

  protected kcal(item: EditableIngredient): number {
    return scale(item.food.per100g, item.grams ?? 0).kcal;
  }

  protected setGrams(index: number, grams: number | null): void {
    this.ingredients.update((list) => list.map((x, i) => (i === index ? { ...x, grams } : x)));
  }

  protected remove(index: number): void {
    this.ingredients.update((list) => list.filter((_, i) => i !== index));
  }

  protected add(): void {
    openFoodPicker(this.dialog).subscribe((food) => {
      if (food) this.ingredients.update((list) => [...list, { food, grams: food.servingGrams ?? 100 }]);
    });
  }
}
