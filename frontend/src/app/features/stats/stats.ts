import { DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatIconButton } from '@angular/material/button';
import { MatButtonToggle, MatButtonToggleGroup } from '@angular/material/button-toggle';
import { MatIcon } from '@angular/material/icon';
import { MatProgressBar } from '@angular/material/progress-bar';
import { ChartConfiguration } from 'chart.js';
import { StatsApi } from '../../core/api';
import { addDays, formatShort, isoWeekNumber, startOfWeek, todayIso } from '../../core/dates';
import { DayStats } from '../../core/models';
import { emptyNutrients, NUTRIENT_KEYS, NUTRIENT_LABELS, Nutrients } from '../../core/nutrition';
import { ThemeService } from '../../core/theme';
import { ChartView, resolveColor } from '../../shared/chart';
import { PageHeader } from '../../shared/page-header';

type Range = 'week' | '4w' | '3m' | '1y';
type Colors = { primary: string; tertiary: string; muted: string; text: string; grid: string };
const RANGE_DAYS: Record<Exclude<Range, 'week'>, number> = { '4w': 28, '3m': 91, '1y': 365 };

@Component({
  selector: 'app-stats',
  imports: [DecimalPipe, PageHeader, ChartView, MatButtonToggleGroup, MatButtonToggle, MatIconButton, MatIcon, MatProgressBar],
  templateUrl: './stats.html',
  styleUrl: './stats.scss',
})
export class StatsPage {
  private api = inject(StatsApi);
  private theme = inject(ThemeService);

  protected readonly keys = NUTRIENT_KEYS;
  protected readonly labels = NUTRIENT_LABELS;
  protected readonly range = signal<Range>('week');
  protected readonly weekOffset = signal(0);

  protected readonly period = computed(() => {
    const today = todayIso();
    const r = this.range();
    if (r === 'week') {
      const from = addDays(startOfWeek(today), this.weekOffset() * 7);
      return { from, to: addDays(from, 6) };
    }
    return { from: addDays(today, -(RANGE_DAYS[r] - 1)), to: today };
  });
  protected readonly periodLabel = computed(() => {
    const { from, to } = this.period();
    const prefix = this.range() === 'week' ? `Uke ${isoWeekNumber(from)} · ` : '';
    return `${prefix}${formatShort(from)} – ${formatShort(to)}`;
  });

  protected readonly stats = rxResource({
    params: () => this.period(),
    stream: ({ params }) => this.api.get(params.from, params.to),
  });

  protected readonly days = computed(() => this.stats.value()?.days ?? []);
  protected readonly totals = computed(() => this.stats.value()?.totals);
  protected readonly hasTdee = computed(() => this.days().some((d) => d.tdee !== null));
  protected readonly fitbitDays = computed(() => this.days().filter((d) => d.tdeeSource === 'Fitbit').length);
  protected readonly avg = computed<Nutrients>(() => {
    const logged = this.days().filter((d) => d.logged);
    const out = emptyNutrients();
    if (!logged.length) return out;
    for (const d of logged) for (const k of NUTRIENT_KEYS) out[k] += d.intake[k];
    for (const k of NUTRIENT_KEYS) out[k] /= logged.length;
    return out;
  });
  protected readonly hasWeights = computed(() => this.days().some((d) => d.weightKg !== null));

  protected readonly energyChart = computed<ChartConfiguration>(() => {
    const c = this.colors();
    const days = this.days();
    return {
      type: 'bar',
      data: {
        labels: days.map((d) => formatShort(d.date)),
        datasets: [
          {
            type: 'bar',
            label: 'Inntak (kcal)',
            data: days.map((d) => (d.logged ? Math.round(d.intake.kcal) : null)),
            backgroundColor: c.primary,
            borderRadius: 6,
            order: 2,
          },
          {
            type: 'line',
            label: 'Forbrenning (kcal)',
            data: days.map((d) => d.tdee),
            borderColor: c.tertiary,
            backgroundColor: c.tertiary,
            pointRadius: 0,
            borderWidth: 2,
            order: 1,
          },
        ],
      },
      options: this.baseOptions(c),
    };
  });

  protected readonly weightChart = computed<ChartConfiguration>(() => {
    const c = this.colors();
    const days = this.days();
    return {
      type: 'line',
      data: {
        labels: days.map((d) => formatShort(d.date)),
        datasets: [
          {
            label: 'Vekt (kg)',
            data: days.map((d) => d.weightKg),
            borderColor: c.muted,
            backgroundColor: c.muted,
            showLine: false,
            pointRadius: 3,
          },
          {
            label: 'Snitt 7 dager',
            data: movingAverage(days, 7),
            borderColor: c.primary,
            backgroundColor: c.primary,
            pointRadius: 0,
            borderWidth: 2,
            spanGaps: true,
            tension: 0.3,
          },
        ],
      },
      options: this.baseOptions(c, false),
    };
  });

  /** Canvas can't use CSS variables, so resolve them whenever the theme changes. */
  private readonly colors = computed<Colors>(() => {
    this.theme.mode();
    this.theme.isDark();
    return {
      primary: resolveColor('var(--mat-sys-primary)'),
      tertiary: resolveColor('var(--mat-sys-tertiary)'),
      muted: resolveColor('var(--mat-sys-outline)'),
      text: resolveColor('var(--mat-sys-on-surface-variant)'),
      grid: resolveColor('var(--mat-sys-outline-variant)'),
    };
  });

  protected setRange(r: Range): void {
    this.range.set(r);
    this.weekOffset.set(0);
  }

  private baseOptions(c: Colors, beginAtZero = true): ChartConfiguration['options'] {
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { labels: { color: c.text, boxWidth: 12 } } },
      scales: {
        x: { ticks: { color: c.text, maxRotation: 0, autoSkipPadding: 12 }, grid: { display: false } },
        y: { beginAtZero, ticks: { color: c.text }, grid: { color: c.grid } },
      },
    };
  }
}

function movingAverage(days: DayStats[], window: number): (number | null)[] {
  return days.map((d, i) => {
    if (d.weightKg === null) return null;
    const slice = days.slice(Math.max(0, i - window + 1), i + 1).filter((x) => x.weightKg !== null);
    return Math.round((slice.reduce((a, x) => a + x.weightKg!, 0) / slice.length) * 10) / 10;
  });
}
