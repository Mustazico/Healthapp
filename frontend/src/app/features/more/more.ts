import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { FormsModule, NgForm } from '@angular/forms';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatButtonToggle, MatButtonToggleGroup } from '@angular/material/button-toggle';
import { MatError, MatFormField, MatHint, MatLabel, MatSuffix } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { MatOption, MatSelect } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { FitbitApi, ProfileApi } from '../../core/api';
import { AuthService } from '../../core/auth';
import { addDays, todayIso } from '../../core/dates';
import { errorMessage } from '../../core/errors';
import { MacroGoalKey, MacroGoalService } from '../../core/macro-goals';
import { Profile } from '../../core/models';
import { ThemeMode, ThemePalette, ThemeService } from '../../core/theme';
import { DecimalInput } from '../../shared/decimal-input';
import { PageHeader } from '../../shared/page-header';

const ACTIVITY = [
  { value: 1.2, label: 'Stillesittende (lite trening)' },
  { value: 1.375, label: 'Lett aktiv (1–3 økter/uke)' },
  { value: 1.55, label: 'Moderat aktiv (3–5 økter/uke)' },
  { value: 1.725, label: 'Svært aktiv (6–7 økter/uke)' },
  { value: 1.9, label: 'Ekstremt aktiv (fysisk jobb + trening)' },
];

const GOALS = [
  { value: 750, label: 'Gå ned ~0,75 kg/uke' },
  { value: 500, label: 'Gå ned ~0,5 kg/uke' },
  { value: 250, label: 'Gå ned ~0,25 kg/uke' },
  { value: 0, label: 'Holde vekten' },
  { value: -250, label: 'Gå opp ~0,25 kg/uke' },
  { value: -500, label: 'Gå opp ~0,5 kg/uke' },
];

function defaultProfile(): Profile {
  return { sex: 'Male', birthDate: '1995-01-01', heightCm: 175, activityFactor: 1.375, deficitKcal: 500, proteinPerKg: 1.6 };
}

const FITBIT_MESSAGES: Record<string, string> = {
  connected: 'Fitbit er koblet til. Forbrenningen hentes nå fra klokka.',
  denied: 'Tilkoblingen ble avbrutt.',
  expired: 'Tilkoblingen tok for lang tid. Prøv igjen.',
  unavailable: 'Fitbit er ikke satt opp på serveren ennå.',
  scope: 'Du må krysse av for tilgang til aktivitetsdata. Prøv igjen.',
  profile: 'Google Health-profilen er ikke ferdig satt opp. Åpne Fitbit-appen, fullfør oppsettet og prøv igjen.',
  error: 'Kunne ikke koble til Fitbit. Prøv igjen.',
};

@Component({
  selector: 'app-more',
  imports: [
    FormsModule,
    DecimalPipe,
    DatePipe,
    RouterLink,
    PageHeader,
    DecimalInput,
    MatButton,
    MatIconButton,
    MatIcon,
    MatFormField,
    MatLabel,
    MatHint,
    MatError,
    MatSuffix,
    MatInput,
    MatSelect,
    MatOption,
    MatButtonToggleGroup,
    MatButtonToggle,
  ],
  templateUrl: './more.html',
  styleUrl: './more.scss',
})
export class MorePage {
  /** Result of the Fitbit OAuth redirect: connected | denied | expired | error | unavailable. */
  readonly fitbitResult = input<string>(undefined, { alias: 'fitbit' });

  protected readonly auth = inject(AuthService);
  protected readonly theme = inject(ThemeService);
  protected readonly macroGoals = inject(MacroGoalService);
  private api = inject(ProfileApi);
  private fitbitApi = inject(FitbitApi);
  private router = inject(Router);
  private snack = inject(MatSnackBar);

  protected readonly activity = ACTIVITY;
  protected readonly goals = GOALS;
  protected readonly isIos = /iPad|iPhone|iPod/.test(navigator.userAgent);
  protected readonly isStandalone = window.matchMedia('(display-mode: standalone)').matches;

  protected readonly summary = rxResource({ stream: () => this.api.get() });
  protected readonly fitbit = rxResource({ stream: () => this.fitbitApi.status() });
  protected readonly fitbitBusy = signal(false);
  protected readonly weights = rxResource({ stream: () => this.api.weights(addDays(todayIso(), -365), todayIso()) });
  protected readonly recentWeights = computed(() => [...(this.weights.value() ?? [])].reverse().slice(0, 8));

  protected profile: Profile = defaultProfile();
  protected readonly savingProfile = signal(false);
  protected readonly weightDate = signal(todayIso());
  protected readonly weightKg = signal<number | null>(null);
  protected readonly today = todayIso();

  constructor() {
    effect(() => {
      const s = this.summary.value();
      if (s?.profile) untracked(() => (this.profile = { ...s.profile! }));
      if (s?.latestWeightKg && this.weightKg() === null) untracked(() => this.weightKg.set(s.latestWeightKg));
    });
    effect(() => {
      const result = this.fitbitResult();
      if (!result) return;
      untracked(() => {
        this.snack.open(FITBIT_MESSAGES[result] ?? FITBIT_MESSAGES['error'], 'OK', { duration: 5000 });
        void this.router.navigate([], { queryParams: { fitbit: null }, replaceUrl: true });
      });
    });
  }

  protected connectFitbit(): void {
    this.fitbitApi.connect();
  }

  protected async syncFitbit(): Promise<void> {
    this.fitbitBusy.set(true);
    try {
      this.fitbit.set(await firstValueFrom(this.fitbitApi.sync()));
      this.summary.reload();
    } catch (err) {
      this.snack.open(errorMessage(err), 'OK', { duration: 4000 });
    } finally {
      this.fitbitBusy.set(false);
    }
  }

  protected async disconnectFitbit(): Promise<void> {
    if (!confirm('Koble fra Fitbit? Synkroniserte forbrenningsdata slettes, og kalorimålet beregnes med formel igjen.')) return;
    this.fitbitBusy.set(true);
    try {
      await firstValueFrom(this.fitbitApi.disconnect());
      this.fitbit.reload();
      this.summary.reload();
    } catch (err) {
      this.snack.open(errorMessage(err), 'OK', { duration: 4000 });
    } finally {
      this.fitbitBusy.set(false);
    }
  }

  protected setTheme(mode: ThemeMode): void {
    this.theme.mode.set(mode);
  }

  protected setPalette(palette: ThemePalette): void {
    this.theme.palette.set(palette);
  }

  protected setMacroGoal(key: MacroGoalKey, value: number | string): void {
    const parsed = Number(value);
    this.macroGoals.setGoal(key, Number.isFinite(parsed) ? parsed : 0);
  }

  protected saveMacroGoals(): void {
    this.macroGoals.save();
    this.snack.open('Målene er lagret', undefined, { duration: 2000 });
  }

  protected resetMacroGoals(): void {
    this.macroGoals.reset();
    this.snack.open('Målene er tilbakestilt', undefined, { duration: 2000 });
  }

  protected async saveProfile(f: NgForm): Promise<void> {
    if (f.invalid) {
      f.form.markAllAsTouched();
      return;
    }
    this.savingProfile.set(true);
    try {
      const summary = await firstValueFrom(this.api.save(this.profile));
      this.summary.set(summary);
      this.snack.open('Profilen er lagret', undefined, { duration: 2000 });
    } catch (err) {
      this.snack.open(errorMessage(err), 'OK', { duration: 4000 });
    } finally {
      this.savingProfile.set(false);
    }
  }

  protected async saveWeight(): Promise<void> {
    const kg = this.weightKg();
    if (!kg || kg < 20 || kg > 400) {
      this.snack.open('Skriv inn en vekt mellom 20 og 400 kg', 'OK', { duration: 3000 });
      return;
    }
    try {
      await firstValueFrom(this.api.saveWeight(this.weightDate(), kg));
      this.snack.open('Vekten er lagret', undefined, { duration: 2000 });
      this.weights.reload();
      this.summary.reload();
    } catch (err) {
      this.snack.open(errorMessage(err), 'OK', { duration: 4000 });
    }
  }

  protected async deleteWeight(date: string): Promise<void> {
    if (!confirm('Slette denne vektmålingen?')) return;
    try {
      await firstValueFrom(this.api.deleteWeight(date));
      this.weights.reload();
      this.summary.reload();
    } catch (err) {
      this.snack.open(errorMessage(err), 'OK', { duration: 4000 });
    }
  }
}
