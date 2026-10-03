import { effect, inject, Injectable, signal } from '@angular/core';
import { ProfileApi } from './api';
import { MacroGoals, Profile } from './models';
import { OVERVIEW_NUTRIENT_KEYS } from './nutrition';

export type MacroGoalKey = (typeof OVERVIEW_NUTRIENT_KEYS)[number];

export const DEFAULT_MACRO_GOALS: Record<MacroGoalKey, number> = {
  carbs: 250,
  fat: 80,
  saturatedFat: 25,
  protein: 120,
  fiber: 30,
  sugar: 50,
};

function normalizeGoals(input?: Partial<MacroGoals>): Record<MacroGoalKey, number> {
  const result = { ...DEFAULT_MACRO_GOALS };
  if (!input) return result;
  for (const key of OVERVIEW_NUTRIENT_KEYS) {
    const value = input[key as MacroGoalKey];
    result[key as MacroGoalKey] = Number.isFinite(value) ? Math.max(0, Number(value)) : result[key as MacroGoalKey];
  }
  return result;
}

const STORAGE_KEY = 'nutritrack.macro-goals';

function readGoals(): Record<MacroGoalKey, number> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_MACRO_GOALS };
    const parsed = JSON.parse(raw) as Partial<Record<MacroGoalKey, number>>;
    const result = { ...DEFAULT_MACRO_GOALS };
    for (const key of OVERVIEW_NUTRIENT_KEYS) {
      const value = parsed[key];
      result[key] = Number.isFinite(value) ? Math.max(0, Number(value)) : result[key];
    }
    return result;
  } catch {
    return { ...DEFAULT_MACRO_GOALS };
  }
}

@Injectable({ providedIn: 'root' })
export class MacroGoalService {
  readonly goals = signal<Record<MacroGoalKey, number>>(readGoals());
  private readonly profileApi = inject(ProfileApi);

  constructor() {
    effect(() => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.goals()));
    });

    this.profileApi.get().subscribe({
      next: (summary) => {
        if (!summary.profile?.macroGoals) return;
        this.goals.set(normalizeGoals(summary.profile.macroGoals));
      },
      error: () => undefined,
    });
  }

  setGoal(key: MacroGoalKey, value: number): void {
    const normalized = Math.max(0, Number.isFinite(value) ? Number(value) : 0);
    this.goals.update((current) => ({
      ...current,
      [key]: normalized,
    }));
    this.persistGoals();
  }

  reset(): void {
    this.goals.set({ ...DEFAULT_MACRO_GOALS });
    this.persistGoals();
  }

  private persistGoals(): void {
    this.profileApi.get().subscribe({
      next: (summary) => {
        const profile: Profile = {
          ...(summary.profile ?? {
            sex: 'Male',
            birthDate: '1995-01-01',
            heightCm: 175,
            activityFactor: 1.375,
            deficitKcal: 500,
            proteinPerKg: 1.6,
          }),
          macroGoals: this.goals(),
        };
        this.profileApi.save(profile).subscribe({ error: () => undefined });
      },
      error: () => undefined,
    });
  }
}
