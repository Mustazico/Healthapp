import { describe, expect, it } from 'vitest';
import {
  dishWeight,
  emptyNutrients,
  IngredientLike,
  Nutrients,
  OVERVIEW_NUTRIENT_KEYS,
  recipePer100g,
  recipePortion,
  recipeTotal,
  roundNutrients,
  scale,
  sum,
} from './nutrition';

const oats: Nutrients = { kcal: 370, protein: 13, carbs: 58, fat: 7, saturatedFat: 1.2, sugar: 1, fiber: 10, salt: 0 };
const milk: Nutrients = { kcal: 46, protein: 3.5, carbs: 4.5, fat: 1.5, saturatedFat: 1, sugar: 4.5, fiber: 0, salt: 0.1 };

describe('nutrition', () => {
  it('scales per-100 g values by grams', () => {
    expect(roundNutrients(scale(oats, 60)).kcal).toBe(222);
    expect(roundNutrients(scale(oats, 60)).protein).toBe(7.8);
    expect(scale(oats, 0)).toEqual(emptyNutrients());
  });

  it('sums nutrients', () => {
    expect(sum([oats, milk]).kcal).toBe(416);
    expect(sum([])).toEqual(emptyNutrients());
  });

  it('computes recipe total, per 100 g and portions using cooked weight', () => {
    const ingredients: IngredientLike[] = [
      { grams: 100, per100g: oats },
      { grams: 400, per100g: milk },
    ];
    // 370 + 184 = 554 kcal in the whole dish
    expect(recipeTotal(ingredients).kcal).toBeCloseTo(554);
    expect(dishWeight(ingredients, null)).toBe(500);
    expect(dishWeight(ingredients, 400)).toBe(400);

    // Cooked down to 400 g: 554 / 400 * 100
    expect(recipePer100g(ingredients, 400).kcal).toBeCloseTo(138.5);
    // A 200 g portion of a 400 g dish is half the total.
    expect(recipePortion(ingredients, 400, 200).kcal).toBeCloseTo(277);
    // Without cooked weight the raw sum (500 g) is used.
    expect(recipePortion(ingredients, null, 250).kcal).toBeCloseTo(277);
  });

  it('uses protein instead of sugar and sugar instead of salt in the homepage summary', () => {
    expect(OVERVIEW_NUTRIENT_KEYS).toEqual(['carbs', 'fat', 'saturatedFat', 'protein', 'fiber', 'sugar']);
  });

  it('handles empty recipes', () => {
    expect(recipePer100g([], null)).toEqual(emptyNutrients());
    expect(recipePortion([], null, 100)).toEqual(emptyNutrients());
  });
});
