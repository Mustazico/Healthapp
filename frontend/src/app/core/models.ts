import { Nutrients } from './nutrition';

export type Meal = 'Breakfast' | 'Lunch' | 'Dinner' | 'Supper' | 'Snacks';
export type FoodSource = 'Manual' | 'Kassalapp' | 'OpenFoodFacts' | 'Matvaretabellen';
export type Sex = 'Male' | 'Female';

export const MEALS: { key: Meal; label: string; icon: string }[] = [
  { key: 'Breakfast', label: 'Frokost', icon: 'free_breakfast' },
  { key: 'Lunch', label: 'Lunsj', icon: 'lunch_dining' },
  { key: 'Dinner', label: 'Middag', icon: 'dinner_dining' },
  { key: 'Supper', label: 'Kvelds', icon: 'bakery_dining' },
  { key: 'Snacks', label: 'Snacks', icon: 'cookie' },
];

export function mealLabel(meal: Meal): string {
  return MEALS.find((m) => m.key === meal)?.label ?? meal;
}

export function isMeal(value: unknown): value is Meal {
  return MEALS.some((m) => m.key === value);
}

export function defaultMealForNow(now = new Date()): Meal {
  const h = now.getHours();
  if (h < 10) return 'Breakfast';
  if (h < 14) return 'Lunch';
  if (h < 18) return 'Dinner';
  if (h < 21) return 'Supper';
  return 'Snacks';
}

export interface Me {
  id: number;
  email: string;
  name: string;
  isAdmin: boolean;
}

export interface Food {
  id: number;
  name: string;
  brand: string | null;
  ean: string | null;
  source: FoodSource;
  imageUrl: string | null;
  servingGrams: number | null;
  per100g: Nutrients;
  updatedAt: string;
}

export interface FoodInput {
  name: string;
  brand: string | null;
  ean: string | null;
  source: FoodSource;
  imageUrl: string | null;
  servingGrams: number | null;
  per100g: Nutrients;
}

export interface FoodDraft extends FoodInput {
  missingNutrients: string[];
}

export interface LookupResult {
  foodId: number | null;
  draft: FoodDraft;
}

export interface RecipeListItem {
  id: number;
  name: string;
  ingredientCount: number;
  cookedWeightGrams: number | null;
  createdBy: string | null;
  updatedAt: string;
}

export interface RecipeIngredient {
  id: number;
  foodId: number;
  grams: number;
  food: Food;
}

export interface Recipe {
  id: number;
  name: string;
  notes: string | null;
  cookedWeightGrams: number | null;
  createdBy: string | null;
  updatedAt: string;
  ingredients: RecipeIngredient[];
}

export interface RecipeInput {
  name: string;
  notes: string | null;
  cookedWeightGrams: number | null;
  ingredients: { foodId: number; grams: number }[];
}

export interface LogEntry {
  id: number;
  date: string;
  meal: Meal;
  name: string;
  grams: number;
  nutrients: Nutrients;
  foodId: number | null;
  recipeId: number | null;
}

export type LogInput = Omit<LogEntry, 'id'>;

export interface MacroGoals {
  carbs: number;
  fat: number;
  saturatedFat: number;
  protein: number;
  fiber: number;
  sugar: number;
}

export interface Profile {
  sex: Sex;
  birthDate: string;
  heightCm: number;
  activityFactor: number;
  deficitKcal: number;
  proteinPerKg: number;
  macroGoals?: MacroGoals;
}

export type TdeeSource = 'Fitbit' | 'Formula';

export interface ProfileSummary {
  profile: Profile | null;
  latestWeightKg: number | null;
  bmr: number | null;
  tdee: number | null;
  targetKcal: number | null;
  proteinTargetG: number | null;
  tdeeSource: TdeeSource | null;
}

export interface FitbitStatus {
  configured: boolean;
  connected: boolean;
  lastSyncAt: string | null;
  lastError: string | null;
  daysSynced: number;
}

export interface WeightEntry {
  date: string;
  weightKg: number;
}

export interface DayEnergy {
  date: string;
  measured: boolean;
  burnedSoFar: number | null;
  steps: number | null;
  /** Measured burn for past days; for today, burn so far plus resting burn for the rest of the day. */
  projectedBurn: number | null;
  targetKcal: number | null;
  updatedAt: string | null;
}

export interface DayStats {
  date: string;
  logged: boolean;
  intake: Nutrients;
  weightKg: number | null;
  tdee: number | null;
  tdeeSource: TdeeSource | null;
  balance: number | null;
}

export interface Stats {
  days: DayStats[];
  totals: {
    loggedDays: number;
    avgKcal: number;
    avgProtein: number;
    totalBalance: number;
    estimatedKgChange: number;
  };
}
