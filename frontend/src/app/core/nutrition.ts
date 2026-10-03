export const NUTRIENT_KEYS = ['kcal', 'protein', 'carbs', 'fat', 'saturatedFat', 'sugar', 'fiber', 'salt'] as const;
export type NutrientKey = (typeof NUTRIENT_KEYS)[number];
export type Nutrients = Record<NutrientKey, number>;

export const NUTRIENT_LABELS: Record<NutrientKey, { label: string; unit: string }> = {
  kcal: { label: 'Energi', unit: 'kcal' },
  protein: { label: 'Protein', unit: 'g' },
  carbs: { label: 'Karbohydrater', unit: 'g' },
  fat: { label: 'Fett', unit: 'g' },
  saturatedFat: { label: 'Mettet fett', unit: 'g' },
  sugar: { label: 'Sukker', unit: 'g' },
  fiber: { label: 'Fiber', unit: 'g' },
  salt: { label: 'Salt', unit: 'g' },
};

export interface IngredientLike {
  grams: number;
  per100g: Nutrients;
}

export function emptyNutrients(): Nutrients {
  return { kcal: 0, protein: 0, carbs: 0, fat: 0, saturatedFat: 0, sugar: 0, fiber: 0, salt: 0 };
}

function map(n: Nutrients, fn: (v: number) => number): Nutrients {
  const out = emptyNutrients();
  for (const k of NUTRIENT_KEYS) out[k] = fn(n[k] ?? 0);
  return out;
}

export function scale(per100g: Nutrients, grams: number): Nutrients {
  const factor = Math.max(0, grams || 0) / 100;
  return map(per100g, (v) => v * factor);
}

export function sum(items: Nutrients[]): Nutrients {
  const out = emptyNutrients();
  for (const n of items) for (const k of NUTRIENT_KEYS) out[k] += n[k] ?? 0;
  return out;
}

export function roundNutrients(n: Nutrients, decimals = 1): Nutrients {
  const f = 10 ** decimals;
  return map(n, (v) => Math.round(v * f) / f);
}

export function rawWeight(ingredients: IngredientLike[]): number {
  return ingredients.reduce((acc, i) => acc + Math.max(0, i.grams || 0), 0);
}

export function recipeTotal(ingredients: IngredientLike[]): Nutrients {
  return sum(ingredients.map((i) => scale(i.per100g, i.grams)));
}

/** Weight of the finished dish: the weighed cooked weight, or the sum of raw ingredients. */
export function dishWeight(ingredients: IngredientLike[], cookedWeightGrams: number | null | undefined): number {
  return cookedWeightGrams && cookedWeightGrams > 0 ? cookedWeightGrams : rawWeight(ingredients);
}

export function recipePer100g(ingredients: IngredientLike[], cookedWeightGrams?: number | null): Nutrients {
  const weight = dishWeight(ingredients, cookedWeightGrams);
  if (weight <= 0) return emptyNutrients();
  return map(recipeTotal(ingredients), (v) => (v / weight) * 100);
}

export function recipePortion(
  ingredients: IngredientLike[],
  cookedWeightGrams: number | null | undefined,
  portionGrams: number,
): Nutrients {
  return scale(recipePer100g(ingredients, cookedWeightGrams), portionGrams);
}
