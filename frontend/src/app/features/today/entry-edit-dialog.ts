import { DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogActions,
  MatDialogContent,
  MatDialogRef,
  MatDialogTitle,
} from '@angular/material/dialog';
import { MatFormField, MatLabel, MatSuffix } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatOption, MatSelect } from '@angular/material/select';
import { LogEntry, LogInput, Meal, MEALS } from '../../core/models';
import { NUTRIENT_KEYS, Nutrients, roundNutrients } from '../../core/nutrition';
import { DecimalInput } from '../../shared/decimal-input';

export type EntryEditResult = { action: 'delete' } | { action: 'save'; input: LogInput };

@Component({
  selector: 'app-entry-edit-dialog',
  imports: [
    FormsModule,
    DecimalPipe,
    MatDialogTitle,
    MatDialogContent,
    MatDialogActions,
    MatButton,
    MatFormField,
    MatLabel,
    MatSuffix,
    MatInput,
    MatSelect,
    MatOption,
    DecimalInput,
  ],
  template: `
    <h2 mat-dialog-title>{{ entry.name }}</h2>
    <mat-dialog-content>
      <div class="fields">
        <mat-form-field>
          <mat-label>Mengde</mat-label>
          <input matInput appDecimal name="grams" [ngModel]="grams()" (ngModelChange)="grams.set($event)" />
          <span matSuffix class="suffix">g</span>
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
      <p class="muted">{{ nutrients().kcal | number: '1.0-0' }} kcal · {{ nutrients().protein | number: '1.0-1' }} g protein</p>
    </mat-dialog-content>
    <mat-dialog-actions>
      <button mat-button type="button" class="delete" (click)="ref.close({ action: 'delete' })">Slett</button>
      <span class="spacer"></span>
      <button mat-button type="button" (click)="ref.close()">Avbryt</button>
      <button mat-flat-button type="button" [disabled]="!valid()" (click)="save()">Lagre</button>
    </mat-dialog-actions>
  `,
  styles: `
    .fields { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; padding-top: 8px; }
    .suffix { padding-right: 12px; }
    .delete { color: var(--mat-sys-error); }
  `,
})
export class EntryEditDialog {
  protected readonly entry = inject<LogEntry>(MAT_DIALOG_DATA);
  protected readonly ref = inject<MatDialogRef<EntryEditDialog, EntryEditResult>>(MatDialogRef);
  protected readonly meals = MEALS;
  protected readonly grams = signal<number | null>(this.entry.grams);
  protected readonly meal = signal<Meal>(this.entry.meal);
  protected readonly valid = computed(() => (this.grams() ?? 0) > 0);

  /** The log stores a snapshot, so rescale it proportionally to the new amount. */
  protected readonly nutrients = computed<Nutrients>(() => {
    const old = this.entry.grams;
    const factor = old > 0 ? (this.grams() ?? 0) / old : 1;
    const out = { ...this.entry.nutrients };
    for (const k of NUTRIENT_KEYS) out[k] = this.entry.nutrients[k] * factor;
    return out;
  });

  protected save(): void {
    const { id: _id, ...rest } = this.entry;
    this.ref.close({
      action: 'save',
      input: { ...rest, grams: this.grams() ?? 0, meal: this.meal(), nutrients: roundNutrients(this.nutrients(), 2) },
    });
  }
}
