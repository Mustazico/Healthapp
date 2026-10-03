import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import {
  DayEnergy,
  FitbitStatus,
  Food,
  FoodInput,
  LogEntry,
  LogInput,
  LookupResult,
  Profile,
  ProfileSummary,
  Recipe,
  RecipeInput,
  RecipeListItem,
  Stats,
  WeightEntry,
} from './models';

@Injectable({ providedIn: 'root' })
export class FoodApi {
  private http = inject(HttpClient);

  search(q = ''): Observable<Food[]> {
    return this.http.get<Food[]>('/api/foods', { params: q ? { q } : {} });
  }
  get(id: number): Observable<Food> {
    return this.http.get<Food>(`/api/foods/${id}`);
  }
  lookup(ean: string): Observable<LookupResult> {
    return this.http.get<LookupResult>(`/api/foods/lookup/${encodeURIComponent(ean)}`);
  }
  create(input: FoodInput): Observable<Food> {
    return this.http.post<Food>('/api/foods', input);
  }
  update(id: number, input: FoodInput): Observable<Food> {
    return this.http.put<Food>(`/api/foods/${id}`, input);
  }
  delete(id: number): Observable<void> {
    return this.http.delete<void>(`/api/foods/${id}`);
  }
}

@Injectable({ providedIn: 'root' })
export class RecipeApi {
  private http = inject(HttpClient);

  list(): Observable<RecipeListItem[]> {
    return this.http.get<RecipeListItem[]>('/api/recipes');
  }
  get(id: number): Observable<Recipe> {
    return this.http.get<Recipe>(`/api/recipes/${id}`);
  }
  create(input: RecipeInput): Observable<Recipe> {
    return this.http.post<Recipe>('/api/recipes', input);
  }
  update(id: number, input: RecipeInput): Observable<Recipe> {
    return this.http.put<Recipe>(`/api/recipes/${id}`, input);
  }
  delete(id: number): Observable<void> {
    return this.http.delete<void>(`/api/recipes/${id}`);
  }
}

@Injectable({ providedIn: 'root' })
export class LogApi {
  private http = inject(HttpClient);

  forDate(date: string): Observable<LogEntry[]> {
    return this.http.get<LogEntry[]>('/api/log', { params: { date } });
  }
  create(input: LogInput): Observable<LogEntry> {
    return this.http.post<LogEntry>('/api/log', input);
  }
  update(id: number, input: LogInput): Observable<LogEntry> {
    return this.http.put<LogEntry>(`/api/log/${id}`, input);
  }
  delete(id: number): Observable<void> {
    return this.http.delete<void>(`/api/log/${id}`);
  }
}

@Injectable({ providedIn: 'root' })
export class ProfileApi {
  private http = inject(HttpClient);

  get(): Observable<ProfileSummary> {
    return this.http.get<ProfileSummary>('/api/profile');
  }
  save(profile: Profile): Observable<ProfileSummary> {
    return this.http.put<ProfileSummary>('/api/profile', profile);
  }
  weights(from?: string, to?: string): Observable<WeightEntry[]> {
    let params = new HttpParams();
    if (from) params = params.set('from', from);
    if (to) params = params.set('to', to);
    return this.http.get<WeightEntry[]>('/api/weights', { params });
  }
  saveWeight(date: string, weightKg: number): Observable<WeightEntry> {
    return this.http.put<WeightEntry>(`/api/weights/${date}`, { weightKg });
  }
  deleteWeight(date: string): Observable<void> {
    return this.http.delete<void>(`/api/weights/${date}`);
  }
  energy(date: string): Observable<DayEnergy> {
    return this.http.get<DayEnergy>(`/api/energy/${date}`);
  }
}

@Injectable({ providedIn: 'root' })
export class StatsApi {
  private http = inject(HttpClient);

  get(from: string, to: string): Observable<Stats> {
    return this.http.get<Stats>('/api/stats', { params: { from, to } });
  }
}

@Injectable({ providedIn: 'root' })
export class FitbitApi {
  private http = inject(HttpClient);

  status(): Observable<FitbitStatus> {
    return this.http.get<FitbitStatus>('/api/fitbit/status');
  }
  sync(): Observable<FitbitStatus> {
    return this.http.post<FitbitStatus>('/api/fitbit/sync', null);
  }
  disconnect(): Observable<void> {
    return this.http.delete<void>('/api/fitbit');
  }
  /** OAuth runs as a full-page redirect through the backend. */
  connect(): void {
    window.location.href = '/api/fitbit/connect';
  }
}
