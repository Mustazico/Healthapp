import { Component, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatFabButton, MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatProgressBar } from '@angular/material/progress-bar';
import { Router, RouterLink } from '@angular/router';
import { RecipeApi } from '../../core/api';
import { todayIso } from '../../core/dates';
import { defaultMealForNow } from '../../core/models';
import { PageHeader } from '../../shared/page-header';

@Component({
  selector: 'app-recipes',
  imports: [PageHeader, RouterLink, MatFabButton, MatIconButton, MatIcon, MatProgressBar],
  template: `
    <div class="page">
      <app-page-header title="Oppskrifter" />
      @if (recipes.isLoading()) {
        <mat-progress-bar mode="indeterminate" />
      }
      @for (r of recipes.value() ?? []; track r.id) {
        <div class="list-item">
          <a class="grow link" [routerLink]="['/recipes', r.id]">
            <div class="title">{{ r.name }}</div>
            <div class="muted small">
              {{ r.ingredientCount }} ingredienser
              @if (r.createdBy) {
                · av {{ r.createdBy }}
              }
            </div>
          </a>
          <button mat-icon-button type="button" (click)="use(r.id)" [attr.aria-label]="'Legg ' + r.name + ' til i dag'">
            <mat-icon>playlist_add</mat-icon>
          </button>
        </div>
      } @empty {
        @if (!recipes.isLoading()) {
          <p class="empty">Ingen oppskrifter ennå. Trykk + for å lage din første rett.</p>
        }
      }
    </div>
    <a mat-fab class="fab" routerLink="/recipes/new" aria-label="Ny oppskrift"><mat-icon>add</mat-icon></a>
  `,
  styles: `
    .link { color: inherit; text-decoration: none; min-width: 0; }
  `,
})
export class RecipesPage {
  private api = inject(RecipeApi);
  private router = inject(Router);
  protected readonly recipes = rxResource({ stream: () => this.api.list() });

  protected use(id: number): void {
    void this.router.navigate(['/add/recipe', id], { queryParams: { date: todayIso(), meal: defaultMealForNow() } });
  }
}
