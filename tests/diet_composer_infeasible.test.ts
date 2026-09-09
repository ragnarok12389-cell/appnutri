import { describe, it, expect } from 'vitest';
import { runDietComposer } from '../src/lib/diet-composer/engine';
import {
  MOCK_TACO_CATALOG,
  STANDARD_CONSTRAINTS,
  STANDARD_TARGETS,
} from './fixtures/diet_composer_fixtures';

describe('Diet Composer — Infeasible Plans & Structured Failure Codes', () => {
  it('should return infeasible with NO_ELIGIBLE_FOODS when candidate catalog is empty or has 0 eligible foods', () => {
    // Zero alimentos no catálogo
    const tinyCatalog: typeof MOCK_TACO_CATALOG = [];

    const result = runDietComposer({
      patient_id: 'patient-tiny-01',
      engine_run_id: 'run-tiny-01',
      nutrition_target_id: 'target-tiny-01',
      targets: STANDARD_TARGETS,
      constraints: STANDARD_CONSTRAINTS,
      food_catalog: tinyCatalog,
      food_dataset_version: '4a_edicao_2011',
      food_dataset_checksum: 'chk_tiny',
      price_engine_version: '1.0.0',
    });

    expect(result.success).toBe(false);
    expect(result.generation_status).toBe('infeasible');
    expect(result.infeasible_reason_codes).toContain('NO_ELIGIBLE_FOODS');
    expect(result.plan).toBeUndefined();
  });

  it('should return infeasible with NO_COMPATIBLE_PROTEIN_SOURCE when all protein sources are refused', () => {
    // Paciente recusa frango, carne, ovo, queijo, salmão e tofu
    const refusedProteinsConstraints = {
      ...STANDARD_CONSTRAINTS,
      foods_patient_refuses: ['frango', 'carne', 'ovo', 'queijo', 'salmao', 'tofu'],
    };

    const result = runDietComposer({
      patient_id: 'patient-no-prot-01',
      engine_run_id: 'run-no-prot-01',
      nutrition_target_id: 'target-no-prot-01',
      targets: STANDARD_TARGETS,
      constraints: refusedProteinsConstraints,
      food_catalog: MOCK_TACO_CATALOG,
      food_dataset_version: '4a_edicao_2011',
      food_dataset_checksum: 'chk_no_prot',
      price_engine_version: '1.0.0',
    });

    expect(result.success).toBe(false);
    expect(result.generation_status).toBe('infeasible');
    expect(result.infeasible_reason_codes).toContain('NO_COMPATIBLE_PROTEIN_SOURCE');
  });

  it('should return infeasible with ENERGY_TARGET_UNREACHABLE for zero or negative calorie targets', () => {
    const invalidTargets = {
      ...STANDARD_TARGETS,
      target_calories_nominal_kcal: 0,
    };

    const result = runDietComposer({
      patient_id: 'patient-zero-kcal',
      engine_run_id: 'run-zero-01',
      nutrition_target_id: 'target-zero-01',
      targets: invalidTargets,
      constraints: STANDARD_CONSTRAINTS,
      food_catalog: MOCK_TACO_CATALOG,
      food_dataset_version: '4a_edicao_2011',
      food_dataset_checksum: 'chk_zero',
      price_engine_version: '1.0.0',
    });

    expect(result.success).toBe(false);
    expect(result.generation_status).toBe('infeasible');
    expect(result.infeasible_reason_codes).toContain('ENERGY_TARGET_UNREACHABLE');
  });

  it('should return infeasible with INVALID_MEAL_COUNT when desired meals count is out of range', () => {
    const invalidMealTargets = {
      ...STANDARD_TARGETS,
      desired_meals_per_day: 10, // Não suportado (máx 8)
    };

    const result = runDietComposer({
      patient_id: 'patient-invalid-meals',
      engine_run_id: 'run-inv-meals-01',
      nutrition_target_id: 'target-inv-meals-01',
      targets: invalidMealTargets,
      constraints: STANDARD_CONSTRAINTS,
      food_catalog: MOCK_TACO_CATALOG,
      food_dataset_version: '4a_edicao_2011',
      food_dataset_checksum: 'chk_inv_meals',
      price_engine_version: '1.0.0',
    });

    expect(result.success).toBe(false);
    expect(result.generation_status).toBe('infeasible');
    expect(result.infeasible_reason_codes).toContain('INVALID_MEAL_COUNT');
  });
});
