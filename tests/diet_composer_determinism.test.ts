import { describe, it, expect } from 'vitest';
import { runDietComposer } from '../src/lib/diet-composer/engine';
import {
  MOCK_TACO_CATALOG,
  STANDARD_CONSTRAINTS,
  STANDARD_TARGETS,
} from './fixtures/diet_composer_fixtures';

describe('Diet Composer — Strict Determinism & Reproducibility', () => {
  const baseInput = {
    patient_id: 'patient-det-01',
    engine_run_id: 'run-det-01',
    nutrition_target_id: 'target-det-01',
    targets: STANDARD_TARGETS,
    constraints: STANDARD_CONSTRAINTS,
    food_catalog: MOCK_TACO_CATALOG,
    food_dataset_version: '4a_edicao_2011',
    food_dataset_checksum: 'canonical_taco_2011_checksum',
    price_engine_version: '1.0.0',
    generation_reference_at: '2026-09-08T12:00:00.000Z',
    day_count: 7,
  };

  it('should produce 100% identical output plan hash across 10 independent executions', () => {
    const runs = Array.from({ length: 10 }).map(() => runDietComposer(baseInput));

    // Todas as execuções devem ser bem-sucedidas
    for (const r of runs) {
      expect(r.success).toBe(true);
      expect(r.plan).toBeDefined();
    }

    const firstHash = runs[0].plan!.output_plan_hash;
    const firstInputHash = runs[0].plan!.input_snapshot_hash;

    expect(firstHash).toMatch(/^[a-f0-9]{64}$/);
    expect(firstInputHash).toMatch(/^[a-f0-9]{64}$/);

    // Todas as outras 9 execuções devem ter exatamente os mesmos hashes
    for (let i = 1; i < runs.length; i++) {
      expect(runs[i].plan!.output_plan_hash).toBe(firstHash);
      expect(runs[i].plan!.input_snapshot_hash).toBe(firstInputHash);
    }
  });

  it('should choose identical foods and identical grams across all 7 days in repeated runs', () => {
    const runA = runDietComposer(baseInput).plan!;
    const runB = runDietComposer(baseInput).plan!;

    expect(runA.days.length).toBe(runB.days.length);

    for (let d = 0; d < runA.days.length; d++) {
      const dayA = runA.days[d];
      const dayB = runB.days[d];

      expect(dayA.actual_calories_kcal).toBe(dayB.actual_calories_kcal);
      expect(dayA.actual_protein_g).toBe(dayB.actual_protein_g);
      expect(dayA.actual_carbohydrate_g).toBe(dayB.actual_carbohydrate_g);
      expect(dayA.actual_fat_g).toBe(dayB.actual_fat_g);

      expect(dayA.meals.length).toBe(dayB.meals.length);

      for (let m = 0; m < dayA.meals.length; m++) {
        const mealA = dayA.meals[m];
        const mealB = dayB.meals[m];

        expect(mealA.items.length).toBe(mealB.items.length);

        for (let it = 0; it < mealA.items.length; it++) {
          const itemA = mealA.items[it];
          const itemB = mealB.items[it];

          expect(itemA.food_id).toBe(itemB.food_id);
          expect(itemA.food_name).toBe(itemB.food_name);
          expect(itemA.grams).toBe(itemB.grams);
          expect(itemA.energy_kcal).toBe(itemB.energy_kcal);
          expect(itemA.composition_snapshot_hash).toBe(itemB.composition_snapshot_hash);
        }
      }
    }
  });
});
