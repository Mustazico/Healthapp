import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, input, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIcon } from '@angular/material/icon';
import { MatProgressBar } from '@angular/material/progress-bar';
import { MatProgressSpinner } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { FitbitApi, LogApi, ProfileApi } from '../../core/api';
import { addDays, formatDay, isIsoDate, todayIso } from '../../core/dates';
import { errorMessage } from '../../core/errors';
import { LogEntry, Meal, MEALS } from '../../core/models';
import { NUTRIENT_LABELS, sum } from '../../core/nutrition';
import { EntryEditDialog, EntryEditResult } from './entry-edit-dialog';

@Component({
  selector: 'app-today',
  imports: [DecimalPipe, DatePipe, RouterLink, MatIcon, MatIconButton, MatButton, MatProgressBar, MatProgressSpinner],
  templateUrl: './today.html',
  styleUrl: './today.scss',
})
export class TodayPage {
  /** Query param `?date=yyyy-MM-dd`; defaults to today. */
  readonly date = input<string>();

  private logApi = inject(LogApi);
  private profileApi = inject(ProfileApi);
  private fitbitApi = inject(FitbitApi);
  private router = inject(Router);
  private dialog = inject(MatDialog);
  private snack = inject(MatSnackBar);

  protected readonly meals = MEALS;
  protected readonly labels = NUTRIENT_LABELS;
  protected readonly day = computed(() => {
    const d = this.date();
    return isIsoDate(d) ? d : todayIso();
  });
  protected readonly dayLabel = computed(() => formatDay(this.day()));

  protected readonly entries = rxResource({
    params: () => this.day(),
    stream: ({ params }) => this.logApi.forDate(params),
  });
  protected readonly summary = rxResource({ stream: () => this.profileApi.get() });
  protected readonly energy = rxResource({
    params: () => this.day(),
    stream: ({ params }) => this.profileApi.energy(params),
  });
  protected readonly measured = computed(() => (this.energy.value()?.measured ? this.energy.value()! : null));
  protected readonly isToday = computed(() => this.day() === todayIso());
  protected readonly refreshing = signal(false);

  protected readonly totals = computed(() => sum((this.entries.value() ?? []).map((e) => e.nutrients)));
  protected readonly byMeal = computed(() => {
    const groups = Object.fromEntries(MEALS.map((m) => [m.key, [] as LogEntry[]])) as Record<Meal, LogEntry[]>;
    for (const e of this.entries.value() ?? []) groups[e.meal]?.push(e);
    return groups;
  });
  protected readonly mealKcal = computed(() => {
    const out = {} as Record<Meal, number>;
    for (const m of MEALS) out[m.key] = this.byMeal()[m.key].reduce((a, e) => a + e.nutrients.kcal, 0);
    return out;
  });

  protected readonly target = computed(() => this.energy.value()?.targetKcal ?? this.summary.value()?.targetKcal ?? null);
  protected readonly remaining = computed(() => (this.target() ?? 0) - this.totals().kcal);
  protected readonly kcalPct = computed(() => {
    const t = this.target();
    return t ? Math.min(100, (this.totals().kcal / t) * 100) : 0;
  });
  protected readonly proteinTarget = computed(() => this.summary.value()?.proteinTargetG ?? null);
  protected readonly proteinPct = computed(() => {
    const t = this.proteinTarget();
    return t ? Math.min(100, (this.totals().protein / t) * 100) : 0;
  });
  protected readonly macroKeys = ['carbs', 'fat', 'saturatedFat', 'sugar', 'fiber', 'salt'] as const;

  protected shift(days: number): void {
    this.goTo(addDays(this.day(), days));
  }

  protected goToday(): void {
    this.goTo(todayIso());
  }

  protected async refreshEnergy(): Promise<void> {
    this.refreshing.set(true);
    try {
      await firstValueFrom(this.fitbitApi.sync());
      this.energy.reload();
    } catch (err) {
      this.snack.open(errorMessage(err), 'OK', { duration: 4000 });
    } finally {
      this.refreshing.set(false);
    }
  }

  protected goTo(date: string): void {
    void this.router.navigate([], { queryParams: { date: date === todayIso() ? null : date }, replaceUrl: true });
  }

  protected edit(entry: LogEntry): void {
    this.dialog
      .open<EntryEditDialog, LogEntry, EntryEditResult>(EntryEditDialog, { data: entry, width: '420px', maxWidth: '95vw' })
      .afterClosed()
      .subscribe(async (result) => {
        if (!result) return;
        try {
          if (result.action === 'delete') {
            await firstValueFrom(this.logApi.delete(entry.id));
            this.snack.open('Slettet', undefined, { duration: 2000 });
          } else {
            await firstValueFrom(this.logApi.update(entry.id, result.input));
          }
          this.entries.reload();
        } catch (err) {
          this.snack.open(errorMessage(err), 'OK', { duration: 4000 });
        }
      });
  }
}
