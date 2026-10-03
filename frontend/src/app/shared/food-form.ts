import { Component, input, OnInit, output } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { MatError, MatFormField, MatLabel } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { FoodInput } from '../core/models';
import { emptyNutrients, NUTRIENT_KEYS, NUTRIENT_LABELS } from '../core/nutrition';
import { DecimalInput } from './decimal-input';

export function blankFood(ean: string | null = null): FoodInput {
  return { name: '', brand: null, ean, source: 'Manual', imageUrl: null, servingGrams: null, per100g: emptyNutrients() };
}

@Component({
  selector: 'app-food-form',
  imports: [FormsModule, MatFormField, MatLabel, MatError, MatInput, MatButton, DecimalInput],
  template: `
    <form #f="ngForm" (ngSubmit)="submit(f, false)" class="stack" novalidate>
      @if (form.imageUrl) {
        <img class="product" [src]="form.imageUrl" alt="" referrerpolicy="no-referrer" />
      }
      <mat-form-field>
        <mat-label>Navn</mat-label>
        <input matInput name="name" [(ngModel)]="form.name" required maxlength="200" />
        <mat-error>Navn må fylles ut</mat-error>
      </mat-form-field>
      <div class="two">
        <mat-form-field>
          <mat-label>Merke</mat-label>
          <input matInput name="brand" [(ngModel)]="form.brand" maxlength="200" />
        </mat-form-field>
        <mat-form-field>
          <mat-label>Strekkode</mat-label>
          <input matInput name="ean" inputmode="numeric" [(ngModel)]="form.ean" pattern="[0-9]{8,14}" />
          <mat-error>8–14 siffer</mat-error>
        </mat-form-field>
      </div>
      <mat-form-field>
        <mat-label>Standard porsjon (g)</mat-label>
        <input matInput appDecimal name="serving" [(ngModel)]="form.servingGrams" min="0.1" />
      </mat-form-field>

      <h3>Næringsinnhold per 100 g</h3>
      @if (missing().length) {
        <p class="warn">Noen verdier manglet. Sjekk etiketten og fyll inn de markerte feltene.</p>
      }
      <div class="nutrients">
        @for (k of keys; track k) {
          <mat-form-field [class.missing]="missing().includes(k)">
            <mat-label>{{ labels[k].label }} ({{ labels[k].unit }})</mat-label>
            <input matInput appDecimal [name]="'n_' + k" [(ngModel)]="form.per100g[k]" required min="0" />
            <mat-error>Påkrevd, minst 0</mat-error>
          </mat-form-field>
        }
      </div>

      <div class="actions">
        @if (secondaryLabel(); as label) {
          <button mat-stroked-button type="button" [disabled]="busy()" (click)="submit(f, true)">{{ label }}</button>
        }
        <button mat-flat-button type="submit" [disabled]="busy()">{{ primaryLabel() }}</button>
      </div>
    </form>
  `,
  styles: `
    .product {
      align-self: center;
      max-height: 140px;
      max-width: 60%;
      object-fit: contain;
      border-radius: 12px;
      background: #fff;
    }
    .two, .nutrients {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0 12px;
    }
    .missing { --mat-form-field-outlined-outline-color: var(--mat-sys-tertiary); }
    .warn {
      margin: 0;
      padding: 8px 12px;
      border-radius: 12px;
      background: var(--mat-sys-tertiary-container);
      color: var(--mat-sys-on-tertiary-container);
    }
    .actions { display: flex; justify-content: flex-end; gap: 8px; flex-wrap: wrap; }
  `,
})
export class FoodForm implements OnInit {
  readonly initial = input<FoodInput | null>(null);
  readonly missing = input<string[]>([]);
  readonly busy = input(false);
  readonly primaryLabel = input('Lagre');
  readonly secondaryLabel = input<string | null>(null);

  /** `secondary` is true when the secondary button was used. */
  readonly saved = output<{ input: FoodInput; secondary: boolean }>();

  protected readonly keys = NUTRIENT_KEYS;
  protected readonly labels = NUTRIENT_LABELS;
  protected form: FoodInput = blankFood();

  ngOnInit(): void {
    const init = this.initial();
    if (init) this.form = { ...init, per100g: { ...init.per100g } };
  }

  protected submit(f: NgForm, secondary: boolean): void {
    if (f.invalid) {
      f.form.markAllAsTouched();
      return;
    }
    const clean = (s: string | null) => (s && s.trim() ? s.trim() : null);
    this.saved.emit({
      input: {
        ...this.form,
        name: this.form.name.trim(),
        brand: clean(this.form.brand),
        ean: clean(this.form.ean),
        servingGrams: this.form.servingGrams || null,
        per100g: { ...this.form.per100g },
      },
      secondary,
    });
  }
}
