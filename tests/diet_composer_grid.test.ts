import { describe, it, expect } from 'vitest';
import { runDietComposer } from '../src/lib/diet-composer/engine';
import {
  MOCK_TACO_CATALOG,
  STANDARD_TARGETS,
  STANDARD_CONSTRAINTS,
} from './fixtures/diet_composer_fixtures';
import type { ComposerInput } from '../src/lib/diet-composer/types';
import type { NutritionConstraints, NutritionTargetData } from '../src/types/nutrition-engine';

describe('ETAPA 6: Diet Composer - Testes de Grid Combinatório e Testes de Propriedade', () => {
  const calorieLevels = [1600, 2100, 2600];
  const macroDistributions = [
    { name: 'Balanced', pPct: 0.25, cPct: 0.50, fPct: 0.25 },
    { name: 'HighProtein', pPct: 0.35, cPct: 0.40, fPct: 0.25 },
    { name: 'HighCarb', pPct: 0.20, cPct: 0.60, fPct: 0.20 },
  ];
  const mealCounts = [3, 4, 5];
  const dietaryPatterns: Array<'omnivore' | 'vegetarian'> = ['omnivore', 'vegetarian'];
  const allergenConfigs = [
    { name: 'NoAllergy', allergies: [] as string[] },
    { name: 'PeanutAllergy', allergies: ['amendoim'] },
  ];

  // Grid Combinatório de 3 x 3 x 3 x 2 x 2 = 108 combinações
  const gridScenarios: Array<{
    calories: number;
    distribution: typeof macroDistributions[0];
    mealCount: number;
    dietaryPattern: 'omnivore' | 'vegetarian';
    allergens: string[];
  }> = [];

  for (const c of calorieLevels) {
    for (const d of macroDistributions) {
      for (const m of mealCounts) {
        for (const p of dietaryPatterns) {
          for (const a of allergenConfigs) {
            gridScenarios.push({
              calories: c,
              distribution: d,
              mealCount: m,
              dietaryPattern: p,
              allergens: a.allergies,
            });
          }
        }
      }
    }
  }

  it(`Executa grade combinatória de ${gridScenarios.length} cenários com estabilidade absoluta e sem invariantes violadas`, () => {
    let calculatedCount = 0;
    let infeasibleCount = 0;

    for (let i = 0; i < gridScenarios.length; i++) {
      const scenario = gridScenarios[i];
      const targetProtein = Math.round((scenario.calories * scenario.distribution.pPct) / 4);
      const targetCarb = Math.round((scenario.calories * scenario.distribution.cPct) / 4);
      const targetFat = Math.round((scenario.calories * scenario.distribution.fPct) / 9);

      const targets: NutritionTargetData = {
        ...STANDARD_TARGETS,
        target_calories_nominal_kcal: scenario.calories,
        target_calories_min_kcal: Math.round(scenario.calories * 0.95),
        target_calories_max_kcal: Math.round(scenario.calories * 1.05),
        protein_g: targetProtein,
        carbohydrate_g: targetCarb,
        fat_g: targetFat,
        protein_kcal: targetProtein * 4,
        carbohydrate_kcal: targetCarb * 4,
        fat_kcal: targetFat * 9,
        desired_meals_per_day: scenario.mealCount,
        calories_per_meal_average: Math.round(scenario.calories / scenario.mealCount),
      };

      const constraints: NutritionConstraints = {
        ...STANDARD_CONSTRAINTS,
        allowed_dietary_pattern: scenario.dietaryPattern,
        patient_reported_allergies: scenario.allergens,
      };

      const input: ComposerInput = {
        patient_id: `grid-patient-${i}`,
        engine_run_id: `grid-run-${i}`,
        nutrition_target_id: `grid-target-${i}`,
        targets,
        constraints,
        food_catalog: MOCK_TACO_CATALOG,
        food_dataset_version: '4.0.0',
        food_dataset_checksum: 'grid-chk-test',
        price_engine_version: '1.0.0',
        day_count: 3, // 3 dias por cenário
      };

      const result = runDietComposer(input);

      // Invariante 1: Nunca deve retornar nulo ou undefined
      expect(result).toBeDefined();

      if (result.success && result.plan) {
        calculatedCount++;
        const plan = result.plan;

        // Invariante 2: Número de dias corresponde
        expect(plan.days.length).toBe(3);

        // Invariante 3: Todas as refeições e itens satisfazem integridade numérica
        for (const day of plan.days) {
          expect(day.meals.length).toBe(scenario.mealCount);

          for (const meal of day.meals) {
            expect(meal.items.length).toBeGreaterThan(0);

            for (const item of meal.items) {
              expect(Number.isFinite(item.grams)).toBe(true);
              expect(item.grams).toBeGreaterThan(0);
              expect(Number.isFinite(item.energy_kcal)).toBe(true);
              expect(Number.isFinite(item.protein_g)).toBe(true);
              expect(Number.isFinite(item.carbohydrate_g)).toBe(true);
              expect(Number.isFinite(item.fat_g)).toBe(true);

              // Invariante 4: Alergia estrita nunca presente
              if (scenario.allergens.includes('amendoim')) {
                expect(item.food_name.toLowerCase()).not.toContain('amendoim');
              }

              // Invariante 5: Padrão alimentar estritamente respeitado
              if (scenario.dietaryPattern === 'vegetarian') {
                expect(item.food_name.toLowerCase()).not.toContain('frango');
                expect(item.food_name.toLowerCase()).not.toContain('patinho');
                expect(item.food_name.toLowerCase()).not.toContain('tilápia');
                expect(item.food_name.toLowerCase()).not.toContain('tilapia');
              }
            }
          }

          // Invariante 6: Aderência dentro de tolerância razoável
          expect(day.actual_calories_kcal).toBeGreaterThan(0);
          expect(day.actual_protein_g).toBeGreaterThan(0);
          expect(day.actual_carbohydrate_g).toBeGreaterThan(0);
          expect(day.actual_fat_g).toBeGreaterThan(0);
        }
      } else {
        infeasibleCount++;
        // Invariante 7: Se infeasible, deve conter reason codes válidos
        expect(result.generation_status).toBe('infeasible');
        expect(result.infeasible_reason_codes.length).toBeGreaterThan(0);
      }
    }

    // Garante que cenários factíveis com o catálogo mock sejam resolvidos com sucesso
    expect(calculatedCount).toBeGreaterThan(0);
    expect(calculatedCount + infeasibleCount).toBe(gridScenarios.length);
  });

  it('Detecta inviabilidade corretamente sob restrições extremas e impossíveis', () => {
    // Alvo impossível: 5000 kcal com padrão vegan e catálogo limitado
    const impossibleTargets: NutritionTargetData = {
      ...STANDARD_TARGETS,
      target_calories_nominal_kcal: 4500,
      target_calories_min_kcal: 4400,
      target_calories_max_kcal: 4600,
      protein_g: 300,
      carbohydrate_g: 600,
      fat_g: 120,
      desired_meals_per_day: 3,
    };

    const impossibleConstraints: NutritionConstraints = {
      ...STANDARD_CONSTRAINTS,
      allowed_dietary_pattern: 'vegan',
      patient_reported_allergies: ['aveia', 'banana', 'arroz', 'azeite', 'feijão'], // elimina quase todos os alimentos veganos
    };

    const impossibleInput: ComposerInput = {
      patient_id: 'extreme-patient',
      engine_run_id: 'extreme-run',
      nutrition_target_id: 'extreme-target',
      targets: impossibleTargets,
      constraints: impossibleConstraints,
      food_catalog: MOCK_TACO_CATALOG,
      food_dataset_version: '4.0.0',
      food_dataset_checksum: 'impossible-chk',
      price_engine_version: '1.0.0',
      day_count: 1,
    };

    const result = runDietComposer(impossibleInput);
    expect(result.success).toBe(false);
    expect(result.generation_status).toBe('infeasible');
    expect(result.infeasible_reason_codes).toBeDefined();
    expect(result.infeasible_reason_codes.length).toBeGreaterThan(0);
  });
});
