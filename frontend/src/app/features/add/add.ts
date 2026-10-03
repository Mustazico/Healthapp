import { Component, computed, inject, input, linkedSignal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatButtonToggle, MatButtonToggleGroup } from '@angular/material/button-toggle';
import { MatIcon } from '@angular/material/icon';
import { MatProgressBar } from '@angular/material/progress-bar';
import { MatTab, MatTabGroup } from '@angular/material/tabs';
import { Router } from '@angular/router';
import { RecipeApi } from '../../core/api';
import { formatDay, isIsoDate, todayIso } from '../../core/dates';
import { defaultMealForNow, Food, isMeal, Meal, MEALS } from '../../core/models';
import { FoodPicker } from '../../shared/food-picker';
import { PageHeader } from '../../shared/page-header';

@Component({
  selector: 'app-add',
  imports: [PageHeader, FoodPicker, MatTabGroup, MatTab, MatButtonToggleGroup, MatButtonToggle, MatIcon, MatProgressBar],
  template: `
    <div class="page">
      <app-page-header [title]="'Legg til · ' + dayLabel()" [back]="true" />

      <mat-button-toggle-group class="meals" [value]="meal()" (change)="meal.set($event.value)" hideSingleSelectionIndicator>
        @for (m of meals; track m.key) {
          <mat-button-toggle [value]="m.key">{{ m.label }}</mat-button-toggle>
        }
      </mat-button-toggle-group>

      <mat-tab-group mat-stretch-tabs animationDuration="0ms">
        <mat-tab label="Varer">
          <div class="tab">
            <app-food-picker (picked)="pickFood($event)" (scan)="scan()" />
          </div>
        </mat-tab>
        <mat-tab label="Oppskrifter">
          <div class="tab">
            @if (recipes.isLoading()) {
              <mat-progress-bar mode="indeterminate" />
            }
            @for (r of recipes.value() ?? []; track r.id) {
              <button type="button" class="list-item" (click)="pickRecipe(r.id)">
                <mat-icon class="muted">menu_book</mat-icon>
                <span class="grow">
                  <div class="title">{{ r.name }}</div>
                  <div class="muted small">{{ r.ingredientCount }} ingredienser</div>
                </span>
                <mat-icon class="muted">chevron_right</mat-icon>
              </button>
            } @empty {
              @if (!recipes.isLoading()) {
                <p class="empty">Ingen oppskrifter ennå. Lag en under «Oppskrifter».</p>
              }
            }
          </div>
        </mat-tab>
      </mat-tab-group>
    </div>
  `,
  styles: `
    .meals { width: 100%; overflow-x: auto; margin-bottom: 8px; }
    .meals mat-button-toggle { flex: 1; }
    .tab { padding-top: 12px; }
  `,
})
export class AddPage {
  readonly date = input<string>();
  readonly mealParam = input<string>(undefined, { alias: 'meal' });

  private router = inject(Router);
  private recipeApi = inject(RecipeApi);

  protected readonly meals = MEALS;
  protected readonly day = computed(() => {
    const d = this.date();
    return isIsoDate(d) ? d : todayIso();
  });
  protected readonly dayLabel = computed(() => formatDay(this.day()));
  protected readonly meal = linkedSignal<Meal>(() => {
    const m = this.mealParam();
    return isMeal(m) ? m : defaultMealForNow();
  });
  protected readonly recipes = rxResource({ stream: () => this.recipeApi.list() });

  private get queryParams() {
    return { date: this.day(), meal: this.meal() };
  }

  protected pickFood(food: Food): void {
    void this.router.navigate(['/add/food', food.id], { queryParams: this.queryParams });
  }

  protected pickRecipe(id: number): void {
    void this.router.navigate(['/add/recipe', id], { queryParams: this.queryParams });
  }

  protected scan(): void {
    void this.router.navigate(['/scan'], { queryParams: this.queryParams });
  }
}
