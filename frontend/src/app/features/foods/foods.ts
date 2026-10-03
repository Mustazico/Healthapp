import { Component, inject } from '@angular/core';
import { MatFabButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { Router, RouterLink } from '@angular/router';
import { Food } from '../../core/models';
import { FoodPicker } from '../../shared/food-picker';
import { PageHeader } from '../../shared/page-header';

@Component({
  selector: 'app-foods',
  imports: [PageHeader, FoodPicker, MatFabButton, MatIcon, RouterLink],
  template: `
    <div class="page">
      <app-page-header title="Varer" [back]="true" fallback="/more" />
      <p class="muted small">Varer er felles for alle i husstanden.</p>
      <app-food-picker (picked)="open($event)" (scan)="router.navigate(['/scan'])" />
    </div>
    <a mat-fab class="fab" routerLink="/foods/new" aria-label="Ny vare"><mat-icon>add</mat-icon></a>
  `,
})
export class FoodsPage {
  protected readonly router = inject(Router);

  protected open(food: Food): void {
    void this.router.navigate(['/foods', food.id]);
  }
}
