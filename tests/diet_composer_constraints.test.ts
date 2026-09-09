import { describe, it, expect } from 'vitest';
import { runDietComposer } from '../src/lib/diet-composer/engine';
import {
  MOCK_TACO_CATALOG,
  STANDARD_CONSTRAINTS,
  STANDARD_TARGETS,
} from './fixtures/diet_composer_fixtures';
import { ComposerCandidateFood } from '../src/lib/diet-composer/types';

describe('Diet Composer — Hard Constraints & Tri-State Allergen Safety', () => {
  it('should NEVER select a food with declared allergy tag = true', () => {
    // Paciente com alergia a ovo declarada
    const constraintsWithAllergy = {
      ...STANDARD_CONSTRAINTS,
      patient_reported_allergies: ['ovo'],
    };

    const result = runDietComposer({
      patient_id: 'patient-allergy-01',
      engine_run_id: 'run-allergy-01',
      nutrition_target_id: 'target-allergy-01',
      targets: STANDARD_TARGETS,
      constraints: constraintsWithAllergy,
      food_catalog: MOCK_TACO_CATALOG,
      food_dataset_version: '4a_edicao_2011',
      food_dataset_checksum: 'chk_allergy',
      price_engine_version: '1.0.0',
      day_count: 7,
    });

    expect(result.success).toBe(true);
    const plan = result.plan!;

    for (const day of plan.days) {
      for (const meal of day.meals) {
        for (const item of meal.items) {
          const food = MOCK_TACO_CATALOG.find((f) => f.id === item.food_id);
          expect(food?.tags?.contains_egg).not.toBe('true');
          expect(item.food_name.toLowerCase()).not.toContain('ovo');
        }
      }
    }
  });

  it('should NEVER select a food with allergen tag = unknown when patient has declared that allergy', () => {
    // Catálogo com um alimento onde tag de ovo é unknown
    const catalogWithUnknown: ComposerCandidateFood[] = MOCK_TACO_CATALOG.map((f) => {
      if (f.id === 'food-006') {
        return {
          ...f,
          name: 'Mistura Misteriosa com Aveia',
          normalized_name: 'mistura misteriosa com aveia',
          tags: {
            ...f.tags,
            contains_egg: 'unknown', // Risco incerto!
          },
        };
      }
      return f;
    });

    const constraintsWithEggAllergy = {
      ...STANDARD_CONSTRAINTS,
      patient_reported_allergies: ['ovo'],
    };

    const result = runDietComposer({
      patient_id: 'patient-unknown-allergen',
      engine_run_id: 'run-unknown-01',
      nutrition_target_id: 'target-unknown-01',
      targets: STANDARD_TARGETS,
      constraints: constraintsWithEggAllergy,
      food_catalog: catalogWithUnknown,
      food_dataset_version: '4a_edicao_2011',
      food_dataset_checksum: 'chk_unknown',
      price_engine_version: '1.0.0',
      day_count: 7,
    });

    expect(result.success).toBe(true);
    const plan = result.plan!;

    for (const day of plan.days) {
      for (const meal of day.meals) {
        for (const item of meal.items) {
          // O alimento com contains_egg = unknown NUNCA pode ser selecionado
          expect(item.food_id).not.toBe('food-006');
        }
      }
    }
  });

  it('should strictly select only vegan foods when allowed_dietary_pattern is vegan', () => {
    const veganConstraints = {
      ...STANDARD_CONSTRAINTS,
      allowed_dietary_pattern: 'vegan',
      favorite_foods: ['tofu', 'feijao', 'arroz', 'banana'],
      preferred_protein_sources: ['tofu', 'feijao'],
    };

    // Alvo adaptado e balanceado para vegano com o catálogo mock
    const veganTargets = {
      ...STANDARD_TARGETS,
      target_calories_nominal_kcal: 1750,
      protein_g: 70,
      carbohydrate_g: 275,
      fat_g: 40,
    };

    const result = runDietComposer({
      patient_id: 'patient-vegan-01',
      engine_run_id: 'run-vegan-01',
      nutrition_target_id: 'target-vegan-01',
      targets: veganTargets,
      constraints: veganConstraints,
      food_catalog: MOCK_TACO_CATALOG,
      food_dataset_version: '4a_edicao_2011',
      food_dataset_checksum: 'chk_vegan',
      price_engine_version: '1.0.0',
      day_count: 7,
    });

    expect(result.success).toBe(true);
    const plan = result.plan!;

    for (const day of plan.days) {
      for (const meal of day.meals) {
        for (const item of meal.items) {
          const food = MOCK_TACO_CATALOG.find((f) => f.id === item.food_id);
          expect(food?.tags?.vegan).toBe('true');
          expect(food?.tags?.vegetarian).toBe('true');
          // Nenhum produto de origem animal
          expect(food?.food_group).not.toContain('Carnes');
          expect(food?.food_group).not.toContain('Ovos');
          expect(food?.food_group).not.toContain('Leite');
          expect(food?.food_group).not.toContain('Pescados');
        }
      }
    }
  });

  it('should NEVER select foods_patient_refuses (HARD constraint)', () => {
    const constraintsWithRefusal = {
      ...STANDARD_CONSTRAINTS,
      foods_patient_refuses: ['feijao'],
    };

    const result = runDietComposer({
      patient_id: 'patient-refused-01',
      engine_run_id: 'run-refused-01',
      nutrition_target_id: 'target-refused-01',
      targets: STANDARD_TARGETS,
      constraints: constraintsWithRefusal,
      food_catalog: MOCK_TACO_CATALOG,
      food_dataset_version: '4a_edicao_2011',
      food_dataset_checksum: 'chk_refused',
      price_engine_version: '1.0.0',
      day_count: 7,
    });

    expect(result.success).toBe(true);
    const plan = result.plan!;

    for (const day of plan.days) {
      for (const meal of day.meals) {
        for (const item of meal.items) {
          const name = item.food_name.toLowerCase();
          expect(name).not.toContain('feijao');
        }
      }
    }
  });

  it('should treat disliked_foods as soft preference (penalized, but not hard blocked unless refused)', () => {
    // Adiciona maçã ao catálogo para haver alternativa viável à banana
    const appleFood: ComposerCandidateFood = {
      id: 'food-014',
      source_food_code: '014',
      name: 'Maçã, Fuji, com casca, crua',
      normalized_name: 'maca fuji com casca crua',
      food_group: 'Frutas e derivados',
      source_type: 'official_table',
      source_version: '4a_edicao_2011',
      preparation_state: 'raw',
      energy_kcal_100g: 56.0,
      protein_g_100g: 0.3,
      carbohydrate_g_100g: 15.2,
      fat_g_100g: 0.2,
      fiber_g_100g: 1.3,
      sodium_mg_100g: 0.0,
      household_measure: { label: 'unidade média', grams: 130 },
      tags: { contains_gluten: 'false', contains_milk: 'false', contains_egg: 'false', contains_soy: 'false', vegan: 'true', vegetarian: 'true' },
      role: 'fruit',
      price_per_100g: 0.80,
      price_confidence: 0.90,
      price_source_level: 'national',
    };
    const catalogWithApple = [...MOCK_TACO_CATALOG, appleFood];

    const constraintsWithDislike = {
      ...STANDARD_CONSTRAINTS,
      disliked_foods: ['banana'],
      favorite_foods: ['maca', 'frango', 'arroz', 'feijao'],
    };

    const result = runDietComposer({
      patient_id: 'patient-dislike-01',
      engine_run_id: 'run-dislike-01',
      nutrition_target_id: 'target-dislike-01',
      targets: STANDARD_TARGETS,
      constraints: constraintsWithDislike,
      food_catalog: catalogWithApple,
      food_dataset_version: '4a_edicao_2011',
      food_dataset_checksum: 'chk_dislike',
      price_engine_version: '1.0.0',
      day_count: 7,
    });

    expect(result.success).toBe(true);
    const plan = result.plan!;

    // Devido à penalidade na função objetivo, maçã deve ser a preferência quando banana é desgostada
    const hasApple = plan.days.some((d) => d.meals.some((m) => m.items.some((i) => i.food_id === 'food-014')));
    expect(hasApple).toBe(true);

    // Agora testa se banana for a ÚNICA fruta e apenas desgostada (soft preference):
    // o motor NÃO deve falhar e deve incluir banana (pois não é recusa obrigatória).
    const resultOnlyBanana = runDietComposer({
      patient_id: 'patient-dislike-only-banana',
      engine_run_id: 'run-dislike-02',
      nutrition_target_id: 'target-dislike-02',
      targets: STANDARD_TARGETS,
      constraints: {
        ...STANDARD_CONSTRAINTS,
        disliked_foods: ['banana'], // Desgostada, mas NÃO em foods_patient_refuses
      },
      food_catalog: MOCK_TACO_CATALOG, // catálogo onde só existe banana como fruta
      food_dataset_version: '4a_edicao_2011',
      food_dataset_checksum: 'chk_dislike',
      price_engine_version: '1.0.0',
      day_count: 7,
    });

    expect(resultOnlyBanana.success).toBe(true);
    const hasBanana = resultOnlyBanana.plan!.days.some((d) => d.meals.some((m) => m.items.some((i) => i.food_id === 'food-007')));
    expect(hasBanana).toBe(true);
  });

  it('should NEVER select a food with tags.vegan = unknown when dietary pattern is vegan (UNKNOWN != SAFE)', () => {
    // Adiciona um suplemento com vegan = 'unknown' e o marca como favorito
    const mysteryFood: ComposerCandidateFood = {
      id: 'food-unk-vegan-01',
      source_food_code: '999',
      name: 'Suplemento Proteico Misterioso',
      normalized_name: 'suplemento proteico misterioso',
      food_group: 'Suplementos',
      source_type: 'official_table',
      source_version: '4a_edicao_2011',
      preparation_state: 'raw',
      energy_kcal_100g: 350.0,
      protein_g_100g: 70.0,
      carbohydrate_g_100g: 10.0,
      fat_g_100g: 2.0,
      fiber_g_100g: 5.0,
      sodium_mg_100g: 10.0,
      household_measure: { label: 'scoop', grams: 30 },
      tags: {
        contains_gluten: 'false',
        contains_milk: 'false',
        contains_egg: 'false',
        contains_soy: 'false',
        vegan: 'unknown', // Origem vegana não confirmada (UNKNOWN != SAFE)
        vegetarian: 'true',
      },
      role: 'protein',
      price_per_100g: 5.0,
      price_confidence: 0.9,
      price_source_level: 'national',
    };

    const catalogWithUnknownVegan: ComposerCandidateFood[] = [
      ...MOCK_TACO_CATALOG,
      mysteryFood,
    ];

    const veganConstraints = {
      ...STANDARD_CONSTRAINTS,
      allowed_dietary_pattern: 'vegan',
      favorite_foods: ['suplemento proteico misterioso', 'tofu', 'feijao', 'arroz', 'banana'],
      preferred_protein_sources: ['suplemento proteico misterioso', 'tofu', 'feijao'],
    };

    const veganTargets = {
      ...STANDARD_TARGETS,
      target_calories_nominal_kcal: 1750,
      protein_g: 70,
      carbohydrate_g: 275,
      fat_g: 40,
    };

    const result = runDietComposer({
      patient_id: 'patient-vegan-unknown',
      engine_run_id: 'run-vegan-unk-01',
      nutrition_target_id: 'target-vegan-unk-01',
      targets: veganTargets,
      constraints: veganConstraints,
      food_catalog: catalogWithUnknownVegan,
      food_dataset_version: '4a_edicao_2011',
      food_dataset_checksum: 'chk_vegan_unk',
      price_engine_version: '1.0.0',
      day_count: 7,
    });

    expect(result.success).toBe(true);
    const plan = result.plan!;

    for (const day of plan.days) {
      for (const meal of day.meals) {
        for (const item of meal.items) {
          // O alimento com vegan='unknown' NUNCA deve ser selecionado (rejeitado pelo candidate-filter)
          expect(item.food_id).not.toBe('food-unk-vegan-01');
        }
      }
    }
  });

  it('should strictly exclude unverified/draft custom foods under v1 policy and accept verified custom foods', () => {
    const customFoodsCatalog: ComposerCandidateFood[] = [
      ...MOCK_TACO_CATALOG,
      {
        id: 'custom-draft-01',
        source_food_code: 'CUST_DRAFT',
        name: 'Whey Artesanal Caseiro',
        normalized_name: 'whey artesanal caseiro',
        food_group: 'Suplementos',
        source_type: 'professional_custom',
        source_version: '1.0.0',
        validation_status: 'draft', // RASCUNHO / NÃO VERIFICADO
        preparation_state: 'raw',
        energy_kcal_100g: 400,
        protein_g_100g: 80,
        carbohydrate_g_100g: 10,
        fat_g_100g: 5,
        fiber_g_100g: 0,
        sodium_mg_100g: 50,
        role: 'protein',
        price_per_100g: 10.0,
        price_confidence: 0.9,
        price_source_level: 'national',
      },
      {
        id: 'custom-verified-01',
        source_food_code: 'CUST_VERIF',
        name: 'Mistura Funcional Validada',
        normalized_name: 'mistura funcional validada',
        food_group: 'Cereais',
        source_type: 'professional_custom',
        source_version: '1.0.0',
        validation_status: 'verified_by_nutritionist', // CLINICAMENTE VERIFICADO
        preparation_state: 'cooked',
        energy_kcal_100g: 150,
        protein_g_100g: 5,
        carbohydrate_g_100g: 30,
        fat_g_100g: 2,
        fiber_g_100g: 3,
        sodium_mg_100g: 10,
        role: 'carb',
        price_per_100g: 2.0,
        price_confidence: 0.9,
        price_source_level: 'national',
      },
    ];

    const result = runDietComposer({
      patient_id: 'patient-custom-v1',
      engine_run_id: 'run-custom-01',
      nutrition_target_id: 'target-custom-01',
      targets: STANDARD_TARGETS,
      constraints: {
        ...STANDARD_CONSTRAINTS,
        favorite_foods: ['mistura funcional validada', 'whey artesanal caseiro'],
      },
      food_catalog: customFoodsCatalog,
      food_dataset_version: '4a_edicao_2011',
      food_dataset_checksum: 'chk_custom_v1',
      price_engine_version: '1.0.0',
      day_count: 7,
    });

    expect(result.success).toBe(true);
    const plan = result.plan!;

    for (const day of plan.days) {
      for (const meal of day.meals) {
        for (const item of meal.items) {
          // O alimento draft NUNCA pode ser selecionado
          expect(item.food_id).not.toBe('custom-draft-01');
        }
      }
    }
  });
});
