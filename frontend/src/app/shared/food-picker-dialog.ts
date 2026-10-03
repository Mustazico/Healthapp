import { Component, inject, signal } from '@angular/core';
import { MatIconButton } from '@angular/material/button';
import { MatDialog, MatDialogContent, MatDialogRef } from '@angular/material/dialog';
import { MatIcon } from '@angular/material/icon';
import { Observable } from 'rxjs';
import { Food } from '../core/models';
import { FoodPicker } from './food-picker';
import { ScanFlow } from './scan-flow';

@Component({
  selector: 'app-food-picker-dialog',
  imports: [MatDialogContent, MatIcon, MatIconButton, FoodPicker, ScanFlow],
  template: `
    <div class="head">
      @if (mode() === 'scan') {
        <button mat-icon-button type="button" (click)="mode.set('search')" aria-label="Tilbake til søk">
          <mat-icon>arrow_back</mat-icon>
        </button>
      }
      <h2>{{ mode() === 'scan' ? 'Skann vare' : 'Velg vare' }}</h2>
      <span class="spacer"></span>
      <button mat-icon-button type="button" (click)="ref.close()" aria-label="Lukk"><mat-icon>close</mat-icon></button>
    </div>
    <mat-dialog-content>
      @if (mode() === 'search') {
        <app-food-picker (picked)="ref.close($event)" (scan)="mode.set('scan')" />
      } @else {
        <app-scan-flow primaryLabel="Lagre og velg" [secondaryLabel]="null" (done)="ref.close($event.food)" />
      }
    </mat-dialog-content>
  `,
  styles: `
    .head { display: flex; align-items: center; gap: 4px; padding: 8px 8px 0 24px; }
    mat-dialog-content { max-height: calc(100dvh - 120px); }
  `,
})
export class FoodPickerDialog {
  protected readonly ref = inject<MatDialogRef<FoodPickerDialog, Food>>(MatDialogRef);
  protected readonly mode = signal<'search' | 'scan'>('search');
}

export function openFoodPicker(dialog: MatDialog): Observable<Food | undefined> {
  return dialog
    .open<FoodPickerDialog, void, Food>(FoodPickerDialog, {
      width: '100vw',
      maxWidth: '640px',
      autoFocus: false,
    })
    .afterClosed();
}
