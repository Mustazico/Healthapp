import { Component, inject, input } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { Food } from '../../core/models';
import { PageHeader } from '../../shared/page-header';
import { ScanFlow } from '../../shared/scan-flow';

@Component({
  selector: 'app-scan',
  imports: [PageHeader, ScanFlow],
  template: `
    <div class="page">
      <app-page-header title="Skann vare" />
      <app-scan-flow (done)="done($event.food, $event.addToLog)" />
    </div>
  `,
})
export class ScanPage {
  readonly date = input<string>();
  readonly meal = input<string>();

  private router = inject(Router);
  private snack = inject(MatSnackBar);

  protected done(food: Food, addToLog: boolean): void {
    if (addToLog) {
      void this.router.navigate(['/add/food', food.id], {
        queryParams: { date: this.date(), meal: this.meal() },
        replaceUrl: true,
      });
    } else {
      this.snack.open(`${food.name} er lagret`, undefined, { duration: 2500 });
      void this.router.navigate(['/foods']);
    }
  }
}
