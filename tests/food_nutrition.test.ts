import { describe, it, expect } from 'vitest';
import {
  calculatePortionNutrition,
  convertHouseholdMeasureToGrams,
  BaseNutrientInfo,
} from '../src/lib/foods/nutrition';
import { validateEnergyConsistency } from '../src/lib/foods/importer/taco-parser';
import { checkFoodCompatibilityWithConstraints } from '../src/lib/foods/compatibility';
import { NutritionConstraints } from '../src/types/nutrition-engine';

describe('ETAPA 5: Food Nutrition & Portion Linearity Tests', () => {
  const sampleNutrients100g: Record<string, BaseNutrientInfo> = {
    energy_kcal: { code: 'energy_kcal', name: 'Energia', unit: 'kcal', amount_per_100g: 128, data_quality: 'analytical' },
    protein_g: { code: 'protein_g', name: 'Proteína', unit: 'g', amount_per_100g: 2.5, data_quality: 'analytical' },
    carbohydrate_g: { code: 'carbohydrate_g', name: 'Carboidrato', unit: 'g', amount_per_100g: 28.1, data_quality: 'analytical' },
    fat_g: { code: 'fat_g', name: 'Lipídios', unit: 'g', amount_per_100g: 0.2, data_quality: 'analytical' },
    fiber_g: { code: 'fiber_g', name: 'Fibra', unit: 'g', amount_per_100g: 1.6, data_quality: 'analytical' },
    sodium_mg: { code: 'sodium_mg', name: 'Sódio', unit: 'mg', amount_per_100g: 1.0, data_quality: 'analytical' },
    calcium_mg: { code: 'calcium_mg', name: 'Cálcio', unit: 'mg', amount_per_100g: 4.0, data_quality: 'analytical' },
    iron_mg: { code: 'iron_mg', name: 'Ferro', unit: 'mg', amount_per_100g: 0.1, data_quality: 'analytical' },
    vitamin_c_mg: { code: 'vitamin_c_mg', name: 'Vitamina C', unit: 'mg', amount_per_100g: null, data_quality: 'not_analyzed' },
  };

  describe('1. Proporcionalidade Estrita de Nutrientes (100g, 50g, 200g)', () => {
    it('100g de alimento deve retornar exatamente a composição base da TACO', () => {
      const portion = calculatePortionNutrition('food-1', 'Arroz cozido', sampleNutrients100g, 100);

      expect(portion.grams).toBe(100);
      expect(portion.nutrients.energy_kcal.amount).toBe(128);
      expect(portion.nutrients.protein_g.amount).toBe(2.5);
      expect(portion.nutrients.carbohydrate_g.amount).toBe(28.1);
      expect(portion.nutrients.fat_g.amount).toBe(0.2);
      expect(portion.nutrients.fiber_g.amount).toBe(1.6);
      expect(portion.nutrients.vitamin_c_mg.amount).toBeNull(); // Nulo permanece nulo!
    });

    it('50g de alimento deve retornar exatamente a metade dos nutrientes', () => {
      const portion = calculatePortionNutrition('food-1', 'Arroz cozido', sampleNutrients100g, 50);

      expect(portion.grams).toBe(50);
      expect(portion.nutrients.energy_kcal.amount).toBe(64);
      expect(portion.nutrients.protein_g.amount).toBe(1.25);
      expect(portion.nutrients.carbohydrate_g.amount).toBe(14.05);
      expect(portion.nutrients.fat_g.amount).toBe(0.1);
      expect(portion.nutrients.fiber_g.amount).toBe(0.8);
      expect(portion.nutrients.vitamin_c_mg.amount).toBeNull();
    });

    it('200g de alimento deve retornar exatamente o dobro dos nutrientes', () => {
      const portion = calculatePortionNutrition('food-1', 'Arroz cozido', sampleNutrients100g, 200);

      expect(portion.grams).toBe(200);
      expect(portion.nutrients.energy_kcal.amount).toBe(256);
      expect(portion.nutrients.protein_g.amount).toBe(5.0);
      expect(portion.nutrients.carbohydrate_g.amount).toBe(56.2);
      expect(portion.nutrients.fat_g.amount).toBe(0.4);
      expect(portion.nutrients.fiber_g.amount).toBe(3.2);
    });

    it('deve rejeitar gramatura negativa com erro explícito', () => {
      expect(() => calculatePortionNutrition('food-1', 'Arroz cozido', sampleNutrients100g, -10)).toThrow(
        /não pode ser negativa/i
      );
    });
  });

  describe('2. Conversão de Medidas Caseiras em Gramas', () => {
    it('deve multiplicar corretamente porção unitária pela quantidade desejada', () => {
      // 1 colher de sopa de arroz = 25g -> 3 colheres = 75g
      const grams = convertHouseholdMeasureToGrams(25, 3);
      expect(grams).toBe(75);

      // 1 concha de feijão = 140g -> 1.5 conchas = 210g
      const concha = convertHouseholdMeasureToGrams(140, 1.5);
      expect(concha).toBe(210);
    });

    it('deve rejeitar medida caseira com gramas zeradas ou negativas', () => {
      expect(() => convertHouseholdMeasureToGrams(0, 2)).toThrow(/positivos/i);
      expect(() => convertHouseholdMeasureToGrams(-15, 2)).toThrow(/positivos/i);
    });
  });

  describe('3. Consistência Energética (4P + 4C + 9G vs Declarado)', () => {
    it('deve classificar alimento perfeitamente alinhado como "consistent"', () => {
      // Arroz cozido: 2.5g P (10 kcal) + 28.1g C (112.4 kcal) + 0.2g F (1.8 kcal) = 124.2 kcal vs 128 kcal (delta ~3%)
      const res = validateEnergyConsistency(128, 2.5, 28.1, 0.2);
      expect(res.status).toBe('consistent');
      expect(res.delta_percentage).toBeLessThanOrEqual(10.0);
    });

    it('deve classificar alimento com variação de fibras/cinzas moderada como "within_tolerance"', () => {
      // 100 kcal declarado, macros totalizam 85 kcal (delta 15%)
      const res = validateEnergyConsistency(100, 5.0, 10.0, 2.77);
      expect(res.status).toBe('within_tolerance');
    });

    it('deve classificar dados ausentes como "insufficient_data"', () => {
      const res = validateEnergyConsistency(128, 2.5, null, 0.2);
      expect(res.status).toBe('insufficient_data');
    });
  });

  describe('4. Compatibilidade com Restrições do Paciente (NutritionConstraints)', () => {
    const baseConstraints: NutritionConstraints = {
      allowed_dietary_pattern: 'omnivore',
      favorite_foods: [],
      disliked_foods: [],
      foods_patient_refuses: [],
      preferred_protein_sources: [],
      preferred_carbohydrate_sources: [],
      preferred_fat_sources: [],
      preferred_fruits: [],
      preferred_vegetables: [],
      cuisine_preferences: [],
      religious_or_cultural_restrictions: [],
      patient_reported_allergies: [],
      patient_reported_intolerances: [],
      patient_reported_clinical_restrictions: [],
      available_cooking_time_minutes: 30,
      cooking_skill_level: 'intermediate',
      meal_prep_days: ['sunday'],
      available_equipment: {
        has_refrigerator: true,
        has_freezer: true,
        has_microwave: true,
        has_stove: true,
        has_air_fryer: true,
      },
      logistics: {
        needs_packed_meals: false,
        eats_out_frequently: false,
        meals_out_per_week: null,
        uses_delivery_frequency: null,
        eats_at_work: false,
        work_refrigerator_available: true,
        work_microwave_available: true,
      },
      habits: {
        water_intake_liters: 2.5,
        coffee_frequency: 'daily',
        alcohol_frequency: 'none',
        hunger_pattern: 'normal',
        primary_challenges: [],
      },
      budget_limit: {
        daily_max: 50,
        currency: 'BRL',
        estimate_type: 'individual_exact',
        flexibility: 'flexible',
      },
    };

    it('deve bloquear alimento contendo frutos do mar para paciente alérgico', () => {
      const camarao = {
        id: 'food-camarao',
        name: 'Camarão, cozido',
        normalized_name: 'camarao cozido',
        food_group: 'Pescados e frutos do mar',
        tags: {
          contains_shellfish: 'true' as const,
          vegan: 'false' as const,
          vegetarian: 'false' as const,
        },
      };

      const constraints: NutritionConstraints = {
        ...baseConstraints,
        patient_reported_allergies: ['frutos do mar', 'camarão'],
      };

      const result = checkFoodCompatibilityWithConstraints(camarao, constraints);
      expect(result.is_compatible).toBe(false);
      expect(result.exclusion_reasons.some((r) => r.includes('contains_shellfish'))).toBe(true);
    });

    it('deve bloquear carne para paciente vegetariano', () => {
      const frango = {
        id: 'food-frango',
        name: 'Frango, peito grelhado',
        normalized_name: 'frango peito grelhado',
        food_group: 'Carnes e derivados',
        tags: {
          vegetarian: 'false' as const,
          vegan: 'false' as const,
        },
      };

      const constraints: NutritionConstraints = {
        ...baseConstraints,
        allowed_dietary_pattern: 'vegetarian',
      };

      const result = checkFoodCompatibilityWithConstraints(frango, constraints);
      expect(result.is_compatible).toBe(false);
      expect(result.exclusion_reasons.some((r) => r.includes('PADRAO_ALIMENTAR_INCOMPATIVEL'))).toBe(true);
    });

    it('deve bloquear alimento expressamente recusado pelo paciente', () => {
      const brocolis = {
        id: 'food-brocolis',
        name: 'Brócolis, cozido',
        normalized_name: 'brocolis cozido',
        food_group: 'Verduras, hortaliças e derivados',
        aliases: ['brócolis'],
      };

      const constraints: NutritionConstraints = {
        ...baseConstraints,
        foods_patient_refuses: ['brócolis'],
      };

      const result = checkFoodCompatibilityWithConstraints(brocolis, constraints);
      expect(result.is_compatible).toBe(false);
      expect(result.exclusion_reasons.some((r) => r.includes('RECUSA_EXPLICITA'))).toBe(true);
    });

    it('deve aprovar alimento saudável e compatível', () => {
      const arroz = {
        id: 'food-arroz',
        name: 'Arroz, integral, cozido',
        normalized_name: 'arroz integral cozido',
        food_group: 'Cereais e derivados',
        tags: {
          vegan: 'true' as const,
          vegetarian: 'true' as const,
          contains_gluten: 'false' as const,
        },
      };

      const result = checkFoodCompatibilityWithConstraints(arroz, baseConstraints);
      expect(result.is_compatible).toBe(true);
      expect(result.exclusion_reasons).toHaveLength(0);
    });
  });

  describe('5. Segurança Estrita Tri-State de Alergias (Auditoria Etapa 5)', () => {
    // Alimento com tag TRUE para glúten
    const foodWithGluten = {
      id: 'food-pao',
      name: 'Pão francês',
      normalized_name: 'pao frances',
      food_group: 'Cereais e derivados',
      tags: { contains_gluten: 'true' as const },
    };

    // Alimento com tag FALSE comprovada para glúten
    const foodGlutenFreeCertified = {
      id: 'food-mandioca',
      name: 'Mandioca cozida',
      normalized_name: 'mandioca cozida',
      food_group: 'Verduras, hortaliças e derivados',
      tags: { contains_gluten: 'false' as const },
    };

    // Alimento com tag UNKNOWN ou AUSENTE para glúten
    const foodGlutenUnknown = {
      id: 'food-industrializado-sem-dado',
      name: 'Biscoito Genérico Sem Rotulagem',
      normalized_name: 'biscoito generico',
      food_group: 'Outros alimentos industrializados',
      tags: { contains_gluten: 'unknown' as const },
    };

    const foodGlutenTagAbsent = {
      id: 'food-preparado-caseiro',
      name: 'Bolo da Casa',
      normalized_name: 'bolo da casa',
      food_group: 'Alimentos preparados',
      tags: {}, // Tag ausente
    };

    const celiacPatientConstraints: NutritionConstraints = {
      allowed_dietary_pattern: 'omnivore',
      favorite_foods: [],
      disliked_foods: [],
      foods_patient_refuses: [],
      preferred_protein_sources: [],
      preferred_carbohydrate_sources: [],
      preferred_fat_sources: [],
      preferred_fruits: [],
      preferred_vegetables: [],
      cuisine_preferences: [],
      religious_or_cultural_restrictions: [],
      patient_reported_allergies: ['glúten', 'trigo'],
      patient_reported_intolerances: [],
      patient_reported_clinical_restrictions: [],
      available_cooking_time_minutes: 30,
      cooking_skill_level: 'intermediate',
      meal_prep_days: ['sunday'],
      available_equipment: {
        has_refrigerator: true,
        has_freezer: true,
        has_microwave: true,
        has_stove: true,
        has_air_fryer: true,
      },
      logistics: {
        needs_packed_meals: false,
        eats_out_frequently: false,
        meals_out_per_week: null,
        uses_delivery_frequency: null,
        eats_at_work: false,
        work_refrigerator_available: true,
        work_microwave_available: true,
      },
      habits: {
        water_intake_liters: 2.5,
        coffee_frequency: 'daily',
        alcohol_frequency: 'none',
        hunger_pattern: 'normal',
        primary_challenges: [],
      },
      budget_limit: {
        daily_max: 50,
        currency: 'BRL',
        estimate_type: 'individual_exact',
        flexibility: 'flexible',
      },
    };

    it('Tag TRUE deve retornar status BLOCKED e is_compatible=false', () => {
      const res = checkFoodCompatibilityWithConstraints(foodWithGluten, celiacPatientConstraints);
      expect(res.status).toBe('blocked');
      expect(res.is_compatible).toBe(false);
      expect(res.blocked_allergens).toContain('gluten');
      expect(res.exclusion_reasons.some((r) => r.includes('ALERGIA_DECLARADA_POSITIVA'))).toBe(true);
    });

    it('Tag FALSE comprovada deve retornar status ALLOWED e is_compatible=true', () => {
      const res = checkFoodCompatibilityWithConstraints(foodGlutenFreeCertified, celiacPatientConstraints);
      expect(res.status).toBe('allowed');
      expect(res.is_compatible).toBe(true);
      expect(res.blocked_allergens).toHaveLength(0);
      expect(res.review_required_allergens).toHaveLength(0);
    });

    it('Tag UNKNOWN NUNCA pode virar ALLOWED automaticamente: deve retornar REVIEW_REQUIRED e is_compatible=false', () => {
      const res = checkFoodCompatibilityWithConstraints(foodGlutenUnknown, celiacPatientConstraints);
      expect(res.status).toBe('review_required');
      expect(res.is_compatible).toBe(false); // O motor não poderá selecionar automaticamente
      expect(res.review_required_allergens).toContain('gluten');
      expect(res.safety_warnings.some((w) => w.includes('ALERGIA_RISCO_DESCONHECIDO'))).toBe(true);
    });

    it('Tag AUSENTE NUNCA pode virar ALLOWED automaticamente: deve retornar REVIEW_REQUIRED e is_compatible=false', () => {
      const res = checkFoodCompatibilityWithConstraints(foodGlutenTagAbsent, celiacPatientConstraints);
      expect(res.status).toBe('review_required');
      expect(res.is_compatible).toBe(false);
      expect(res.review_required_allergens).toContain('gluten');
      expect(res.safety_warnings.some((w) => w.includes('ALERGIA_RISCO_DESCONHECIDO'))).toBe(true);
    });
  });
});
