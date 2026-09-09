import { describe, it, expect } from 'vitest';
import { runDietComposer } from '../src/lib/diet-composer/engine';
import {
  MOCK_TACO_CATALOG,
  STANDARD_CONSTRAINTS,
  STANDARD_TARGETS,
} from './fixtures/diet_composer_fixtures';
import { evaluatePlanPricing } from '../src/lib/diet-composer/budget';

describe('Diet Composer — Budget Logic & Price Engine Integration', () => {
  it('should accurately compute estimated daily cost, weekly cost and coverage percentage', () => {
    const result = runDietComposer({
      patient_id: 'patient-budget-01',
      engine_run_id: 'run-budget-01',
      nutrition_target_id: 'target-budget-01',
      targets: {
        ...STANDARD_TARGETS,
        normalized_daily_budget: 45.0, // R$ 45/dia
      },
      constraints: STANDARD_CONSTRAINTS,
      food_catalog: MOCK_TACO_CATALOG,
      food_dataset_version: '4a_edicao_2011',
      food_dataset_checksum: 'chk_budget',
      price_engine_version: '1.0.0',
      day_count: 7,
    });

    expect(result.success).toBe(true);
    const plan = result.plan!;

    expect(plan.estimated_daily_cost).toBeGreaterThan(0);
    expect(plan.estimated_weekly_cost).toBeCloseTo(plan.estimated_daily_cost! * 7, 1);
    expect(plan.price_coverage_percentage).toBeGreaterThanOrEqual(70.0);
    expect(plan.budget_confidence).toBeGreaterThan(0);
    expect(plan.currency).toBe('BRL');
    expect(plan.budget_status).toBe('within_budget');
  });

  it('should mark budget_status as exceeds_budget when daily cost is above target', () => {
    const result = runDietComposer({
      patient_id: 'patient-budget-low',
      engine_run_id: 'run-budget-low-01',
      nutrition_target_id: 'target-budget-low-01',
      targets: {
        ...STANDARD_TARGETS,
        normalized_daily_budget: 5.0, // Orçamento impossivelmente baixo (R$ 5/dia)
      },
      constraints: STANDARD_CONSTRAINTS,
      food_catalog: MOCK_TACO_CATALOG,
      food_dataset_version: '4a_edicao_2011',
      food_dataset_checksum: 'chk_budget_low',
      price_engine_version: '1.0.0',
      day_count: 7,
    });

    expect(result.success).toBe(true);
    const plan = result.plan!;

    // O custo real deve ser superior a R$ 5
    expect(plan.estimated_daily_cost).toBeGreaterThan(5.0);
    expect(plan.budget_status).toBe('exceeds_budget');
  });

  it('should return infeasible with BUDGET_INSUFFICIENT when budget is HARD and exceeds budget', () => {
    const result = runDietComposer({
      patient_id: 'patient-budget-hard',
      engine_run_id: 'run-budget-hard-01',
      nutrition_target_id: 'target-budget-hard-01',
      targets: {
        ...STANDARD_TARGETS,
        normalized_daily_budget: 5.0, // R$ 5/dia (impossível para a meta)
      },
      is_budget_hard: true, // HARD CONSTRAINT
      constraints: STANDARD_CONSTRAINTS,
      food_catalog: MOCK_TACO_CATALOG,
      food_dataset_version: '4a_edicao_2011',
      food_dataset_checksum: 'chk_budget_hard',
      price_engine_version: '1.0.0',
      day_count: 7,
    });

    expect(result.success).toBe(false);
    expect(result.generation_status).toBe('infeasible');
    expect(result.infeasible_reason_codes).toContain('BUDGET_INSUFFICIENT');
  });

  it('should treat unknown price as null (NOT zero) and mark budget_unverified when coverage is low', () => {
    // Catálogo onde a maioria dos alimentos tem preço nulo
    const catalogWithoutPrices = MOCK_TACO_CATALOG.map((f, idx) => ({
      ...f,
      price_per_100g: idx === 0 ? 1.0 : null, // Apenas 1 alimento tem preço
      price_confidence: idx === 0 ? 0.9 : 0,
    }));

    const result = runDietComposer({
      patient_id: 'patient-no-prices',
      engine_run_id: 'run-no-prices-01',
      nutrition_target_id: 'target-no-prices-01',
      targets: STANDARD_TARGETS,
      constraints: STANDARD_CONSTRAINTS,
      food_catalog: catalogWithoutPrices,
      food_dataset_version: '4a_edicao_2011',
      food_dataset_checksum: 'chk_no_prices',
      price_engine_version: '1.0.0',
      day_count: 7,
    });

    expect(result.success).toBe(true);
    const plan = result.plan!;

    // Cobertura baixa (< 70%)
    expect(plan.price_coverage_percentage).toBeLessThan(70.0);
    // Preço desconhecido NÃO é zero: o status não pode afirmar 'within_budget'
    expect(plan.budget_status).toBe('budget_unverified');
  });

  it('should strictly isolate currency and not mix with foreign currencies', () => {
    const evalResult = evaluatePlanPricing(
      [
        {
          food_id: 'food-01',
          source_id: 'src-01',
          source_food_code: '01',
          currency: 'BRL',
          item_order: 1,
          food_name: 'Alimento BRL',
          source_type: 'official',
          source_version: '1',
          grams: 100,
          energy_kcal: 100,
          protein_g: 10,
          carbohydrate_g: 10,
          fat_g: 2,
          fiber_g: 1,
          sodium_mg: 10,
          household_measure_label: null,
          household_measure_quantity: null,
          price_estimate: 5.50,
          price_confidence: 0.9,
          price_source_level: 'national',
          composition_snapshot_hash: 'hash',
        },
      ],
      30.0,
      7,
      'BRL'
    );

    expect(evalResult.currency).toBe('BRL');
    expect(evalResult.estimated_daily_cost).toBe(5.50);
    expect(evalResult.estimated_weekly_cost).toBe(38.50);
  });
});
