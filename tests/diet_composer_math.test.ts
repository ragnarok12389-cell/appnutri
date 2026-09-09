import { describe, it, expect } from 'vitest';
import { runDietComposer } from '../src/lib/diet-composer/engine';
import {
  MOCK_TACO_CATALOG,
  STANDARD_CONSTRAINTS,
  STANDARD_TARGETS,
} from './fixtures/diet_composer_fixtures';
import { COMPOSER_TOLERANCES } from '../src/lib/diet-composer/config';

describe('Diet Composer — Mathematical Correctness, Invariants & Tolerances', () => {
  const composerInput = {
    patient_id: 'patient-test-01',
    engine_run_id: 'run-test-01',
    nutrition_target_id: 'target-test-01',
    targets: STANDARD_TARGETS,
    constraints: STANDARD_CONSTRAINTS,
    food_catalog: MOCK_TACO_CATALOG,
    food_dataset_version: '4a_edicao_2011',
    food_dataset_checksum: 'test_checksum',
    price_engine_version: '1.0.0',
    day_count: 7,
  };

  it('should successfully compose a 7-day plan satisfying mathematical invariants', () => {
    const result = runDietComposer(composerInput);
    expect(result.success).toBe(true);
    expect(result.plan).toBeDefined();

    const plan = result.plan!;
    expect(plan.days.length).toBe(7);

    let weeklyActualKcal = 0;

    for (const day of plan.days) {
      expect(day.meals.length).toBeGreaterThanOrEqual(3);

      let dayComputedKcal = 0;
      let dayComputedProtein = 0;
      let dayComputedCarb = 0;
      let dayComputedFat = 0;

      for (const meal of day.meals) {
        expect(meal.items.length).toBeGreaterThan(0);

        let mealComputedKcal = 0;
        let mealComputedProtein = 0;
        let mealComputedCarb = 0;
        let mealComputedFat = 0;

        for (const item of meal.items) {
          // 1. Integridade de porções em gramas
          expect(item.grams).toBeGreaterThan(0);
          expect(Number.isFinite(item.grams)).toBe(true);
          expect(Number.isNaN(item.grams)).toBe(false);

          // 2. Valores nutricionais não negativos e finitos
          expect(item.energy_kcal).toBeGreaterThanOrEqual(0);
          expect(item.protein_g).toBeGreaterThanOrEqual(0);
          expect(item.carbohydrate_g).toBeGreaterThanOrEqual(0);
          expect(item.fat_g).toBeGreaterThanOrEqual(0);

          expect(Number.isFinite(item.energy_kcal)).toBe(true);
          expect(Number.isFinite(item.protein_g)).toBe(true);
          expect(Number.isFinite(item.carbohydrate_g)).toBe(true);
          expect(Number.isFinite(item.fat_g)).toBe(true);

          // 3. Hash imutável de snapshot presente
          expect(item.composition_snapshot_hash).toMatch(/^[a-f0-9]{64}$/);

          mealComputedKcal += item.energy_kcal;
          mealComputedProtein += item.protein_g;
          mealComputedCarb += item.carbohydrate_g;
          mealComputedFat += item.fat_g;
        }

        // 4. Invariante: Soma dos itens = Soma da refeição (tolerância de arredondamento 0.05)
        expect(meal.actual_calories_kcal).toBeCloseTo(mealComputedKcal, 1);
        expect(meal.actual_protein_g).toBeCloseTo(mealComputedProtein, 1);
        expect(meal.actual_carbohydrate_g).toBeCloseTo(mealComputedCarb, 1);
        expect(meal.actual_fat_g).toBeCloseTo(mealComputedFat, 1);

        dayComputedKcal += meal.actual_calories_kcal;
        dayComputedProtein += meal.actual_protein_g;
        dayComputedCarb += meal.actual_carbohydrate_g;
        dayComputedFat += meal.actual_fat_g;
      }

      // 5. Invariante: Soma das refeições = Soma do dia
      expect(day.actual_calories_kcal).toBeCloseTo(dayComputedKcal, 1);
      expect(day.actual_protein_g).toBeCloseTo(dayComputedProtein, 1);
      expect(day.actual_carbohydrate_g).toBeCloseTo(dayComputedCarb, 1);
      expect(day.actual_fat_g).toBeCloseTo(dayComputedFat, 1);

      // 6. Invariante: Aderência dentro das tolerâncias operacionais
      const kcalDelta = Math.abs(day.actual_calories_kcal - day.target_calories_kcal);
      const kcalMaxAllowed = Math.max(
        COMPOSER_TOLERANCES.CALORIES.absolute_min_kcal,
        day.target_calories_kcal * (COMPOSER_TOLERANCES.CALORIES.percentage / 100)
      );
      expect(kcalDelta).toBeLessThanOrEqual(kcalMaxAllowed + 1.0); // margem discreta

      const protDelta = Math.abs(day.actual_protein_g - day.target_protein_g);
      const protMaxAllowed = Math.max(
        COMPOSER_TOLERANCES.PROTEIN.absolute_min_g,
        day.target_protein_g * (COMPOSER_TOLERANCES.PROTEIN.percentage / 100)
      );
      expect(protDelta).toBeLessThanOrEqual(protMaxAllowed + 1.0);

      expect(day.adherence_status).toBe('within_tolerance');

      weeklyActualKcal += day.actual_calories_kcal;
    }

    expect(weeklyActualKcal).toBeGreaterThan(0);
    expect(Number.isFinite(weeklyActualKcal)).toBe(true);
  });

  it('should preserve household measures when available and never invent measures', () => {
    const result = runDietComposer(composerInput);
    const plan = result.plan!;

    let checkedItemsWithMeasure = 0;
    let checkedItemsWithoutMeasure = 0;

    for (const day of plan.days) {
      for (const meal of day.meals) {
        for (const item of meal.items) {
          const original = MOCK_TACO_CATALOG.find((c) => c.id === item.food_id);
          if (original?.household_measure) {
            expect(item.household_measure_label).toBe(original.household_measure.label);
            expect(item.household_measure_quantity).toBeGreaterThan(0);
            checkedItemsWithMeasure++;
          } else {
            expect(item.household_measure_label).toBeNull();
            checkedItemsWithoutMeasure++;
          }
        }
      }
    }

    expect(checkedItemsWithMeasure).toBeGreaterThan(0);
    expect(checkedItemsWithoutMeasure).toBeGreaterThanOrEqual(0);
  });
});
