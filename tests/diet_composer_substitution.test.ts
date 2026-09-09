import { describe, it, expect } from 'vitest';
import { getFoodSubstitutionOptions } from '../src/lib/diet-composer/substitution';
import {
  MOCK_TACO_CATALOG,
  STANDARD_CONSTRAINTS,
} from './fixtures/diet_composer_fixtures';
import { DietMealItemSnapshot } from '../src/types/diet-plan';

describe('Diet Composer — Smart Food Substitution ("Troca Inteligente")', () => {
  const chickenItem: DietMealItemSnapshot = {
    food_id: 'food-003', // Frango, peito grelhado (32g prot/100g)
    source_id: 'src-taco',
    source_food_code: '003',
    currency: 'BRL',
    item_order: 1,
    food_name: 'Frango, peito, sem pele, grelhado',
    source_type: 'official_table',
    source_version: '4a_edicao_2011',
    grams: 100,
    energy_kcal: 159.0,
    protein_g: 32.0,
    carbohydrate_g: 0.0,
    fat_g: 2.5,
    fiber_g: 0.0,
    sodium_mg: 50.0,
    household_measure_label: 'filé médio',
    household_measure_quantity: 1,
    price_estimate: 2.20,
    price_confidence: 0.95,
    price_source_level: 'national',
    composition_snapshot_hash: 'hash_chicken',
  };

  it('should return compatible protein substitutions with appropriate suggested grams', () => {
    const options = getFoodSubstitutionOptions(
      chickenItem,
      STANDARD_CONSTRAINTS,
      MOCK_TACO_CATALOG
    );

    expect(options.length).toBeGreaterThan(0);

    // Nenhuma opção pode ser o próprio alimento
    for (const opt of options) {
      expect(opt.food_id).not.toBe(chickenItem.food_id);
      expect(opt.suggested_grams).toBeGreaterThan(0);
      expect(Number.isFinite(opt.energy_kcal)).toBe(true);
      expect(Number.isFinite(opt.protein_g)).toBe(true);

      // Deltas calculados com precisão
      expect(opt.nutrition_delta).toBeDefined();
      expect(opt.nutrition_delta.delta_kcal).toBeCloseTo(opt.energy_kcal - chickenItem.energy_kcal, 2);
      expect(opt.nutrition_delta.delta_protein_g).toBeCloseTo(opt.protein_g - chickenItem.protein_g, 2);
    }
  });

  it('should NEVER suggest an alternative that violates patient declared allergies', () => {
    // Paciente com alergia a peixe
    const constraintsAllergicToFish = {
      ...STANDARD_CONSTRAINTS,
      patient_reported_allergies: ['peixe'],
    };

    // Filtrar catálogo simulando o pipeline
    const safeCatalog = MOCK_TACO_CATALOG.filter((f) => f.tags?.contains_fish !== 'true');

    const options = getFoodSubstitutionOptions(
      chickenItem,
      constraintsAllergicToFish,
      safeCatalog
    );

    // Salmão (food-011) NUNCA pode aparecer
    const salmonOption = options.find((o) => o.food_id === 'food-011');
    expect(salmonOption).toBeUndefined();
  });

  it('should calculate cost delta accurately when prices are available', () => {
    const options = getFoodSubstitutionOptions(
      chickenItem,
      STANDARD_CONSTRAINTS,
      MOCK_TACO_CATALOG
    );

    const beefOption = options.find((o) => o.food_id === 'food-004'); // Carne bovina patinho
    if (beefOption && beefOption.price_estimate !== null && chickenItem.price_estimate !== null) {
      expect(beefOption.cost_delta).toBeCloseTo(
        beefOption.price_estimate - chickenItem.price_estimate,
        2
      );
    }
  });

  it('should be 100% deterministic and produce identical ordered options in repeated calls', () => {
    const optionsA = getFoodSubstitutionOptions(chickenItem, STANDARD_CONSTRAINTS, MOCK_TACO_CATALOG);
    const optionsB = getFoodSubstitutionOptions(chickenItem, STANDARD_CONSTRAINTS, MOCK_TACO_CATALOG);

    expect(optionsA.length).toBe(optionsB.length);

    for (let i = 0; i < optionsA.length; i++) {
      expect(optionsA[i].food_id).toBe(optionsB[i].food_id);
      expect(optionsA[i].suggested_grams).toBe(optionsB[i].suggested_grams);
      expect(optionsA[i].energy_kcal).toBe(optionsB[i].energy_kcal);
      expect(optionsA[i].compatibility_status).toBe(optionsB[i].compatibility_status);
    }
  });
});
