import { DecimalPipe } from '@angular/common';
import { Component, input } from '@angular/core';
import { NUTRIENT_KEYS, NUTRIENT_LABELS, Nutrients } from '../core/nutrition';

@Component({
  selector: 'app-nutrient-grid',
  imports: [DecimalPipe],
  template: `
    <div class="grid">
      @for (k of keys; track k) {
        <div class="cell" [class.primary]="k === 'kcal'">
          <span class="label">{{ labels[k].label }}</span>
          <span class="value">{{ nutrients()[k] | number: (k === 'kcal' ? '1.0-0' : '1.0-1') }} {{ labels[k].unit }}</span>
        </div>
      }
    </div>
  `,
  styles: `
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
      gap: 8px;
    }
    .cell {
      display: flex;
      justify-content: space-between;
      gap: 8px;
      padding: 8px 12px;
      border-radius: 12px;
      background: var(--mat-sys-surface-container);
    }
    .cell.primary {
      background: var(--mat-sys-secondary-container);
      color: var(--mat-sys-on-secondary-container);
      font-weight: 500;
    }
    .label { color: inherit; opacity: 0.8; }
    .value { white-space: nowrap; }
  `,
})
export class NutrientGrid {
  readonly nutrients = input.required<Nutrients>();
  protected readonly keys = NUTRIENT_KEYS;
  protected readonly labels = NUTRIENT_LABELS;
}
