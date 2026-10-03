import { Location } from '@angular/common';
import { Component, computed, inject, input, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatProgressBar } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import { firstValueFrom, of } from 'rxjs';
import { FoodApi } from '../../core/api';
import { errorMessage } from '../../core/errors';
import { FoodInput } from '../../core/models';
import { blankFood, FoodForm } from '../../shared/food-form';
import { PageHeader } from '../../shared/page-header';

@Component({
  selector: 'app-food-edit',
  imports: [PageHeader, FoodForm, MatIconButton, MatIcon, MatProgressBar],
  template: `
    <div class="page">
      <app-page-header [title]="isNew() ? 'Ny vare' : 'Rediger vare'" [back]="true" fallback="/foods">
        @if (!isNew()) {
          <button mat-icon-button type="button" (click)="remove()" aria-label="Slett vare"><mat-icon>delete</mat-icon></button>
        }
      </app-page-header>
      @if (initial(); as init) {
        <app-food-form [initial]="init" [busy]="saving()" (saved)="save($event.input)" />
      } @else if (food.error()) {
        <p class="error-text">Fant ikke varen.</p>
      } @else {
        <mat-progress-bar mode="indeterminate" />
      }
    </div>
  `,
})
export class FoodEditPage {
  /** Route param; undefined on /foods/new. */
  readonly id = input<string>();
  /** Optional `?ean=` prefill for new foods. */
  readonly ean = input<string>();

  private api = inject(FoodApi);
  private location = inject(Location);
  private snack = inject(MatSnackBar);

  protected readonly isNew = computed(() => !this.id());
  protected readonly saving = signal(false);
  protected readonly food = rxResource({
    params: () => this.id(),
    stream: ({ params }) => (params ? this.api.get(Number(params)) : of(null)),
  });
  protected readonly initial = computed<FoodInput | null>(() => {
    if (this.isNew()) return blankFood(this.ean() ?? null);
    const f = this.food.value();
    return f ? { name: f.name, brand: f.brand, ean: f.ean, source: f.source, imageUrl: f.imageUrl, servingGrams: f.servingGrams, per100g: f.per100g } : null;
  });

  protected async save(input: FoodInput): Promise<void> {
    this.saving.set(true);
    try {
      const id = this.id();
      await firstValueFrom(id ? this.api.update(Number(id), input) : this.api.create(input));
      this.snack.open('Varen er lagret', undefined, { duration: 2000 });
      this.location.back();
    } catch (err) {
      this.snack.open(errorMessage(err), 'OK', { duration: 4000 });
    } finally {
      this.saving.set(false);
    }
  }

  protected async remove(): Promise<void> {
    const f = this.food.value();
    if (!f || !confirm(`Slette «${f.name}»? Varen forsvinner for alle i husstanden.`)) return;
    try {
      await firstValueFrom(this.api.delete(f.id));
      this.snack.open('Varen er slettet', undefined, { duration: 2000 });
      this.location.back();
    } catch (err) {
      this.snack.open(errorMessage(err), 'OK', { duration: 4000 });
    }
  }
}
