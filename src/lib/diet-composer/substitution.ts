// ==============================================================================
// SUBSTITUTION ENGINE: DETERMINISTIC SMART FOOD SUBSTITUTION ("TROCA INTELIGENTE")
// ==============================================================================

import { NutritionConstraints } from '@/types/nutrition-engine';
import {
  DietMealItemSnapshot,
  FoodSubstitutionOption,
} from '@/types/diet-plan';
import { ComposerCandidateFood } from './types';
import { getPortionBoundary } from './solver';

/**
 * Retorna opções determinísticas de substituição inteligente para um item da dieta.
 * ZERO inteligência artificial ou chamadas externas.
 */
export function getFoodSubstitutionOptions(
  planItem: DietMealItemSnapshot,
  patientConstraints: NutritionConstraints,
  eligibleFoods: ComposerCandidateFood[]
): FoodSubstitutionOption[] {
  const options: FoodSubstitutionOption[] = [];

  // Encontra o papel e características do item original
  const originalFood = eligibleFoods.find((f) => f.id === planItem.food_id);
  const targetRole = originalFood?.role || 'carb';

  // 1. Filtrar candidatos com função semelhante
  const candidates = eligibleFoods.filter((f) => {
    if (f.id === planItem.food_id) return false; // Não sugerir o mesmo alimento

    // Mesma função primária (ou compatível)
    if (targetRole === 'protein') {
      return f.role === 'protein' || f.role === 'dairy';
    }
    if (targetRole === 'carb') {
      return f.role === 'carb' || f.role === 'legume';
    }
    if (targetRole === 'legume') {
      return f.role === 'legume' || f.role === 'carb';
    }
    if (targetRole === 'fruit') {
      return f.role === 'fruit';
    }
    if (targetRole === 'vegetable') {
      return f.role === 'vegetable';
    }
    if (targetRole === 'lipid') {
      return f.role === 'lipid';
    }

    return f.food_group === originalFood?.food_group;
  });

  for (const food of candidates) {
    const bounds = getPortionBoundary(food);

    // 2. Calcular gramagem para equivalência de macronutrientes
    let suggestedGrams: number;

    if (targetRole === 'protein' && planItem.protein_g > 0 && food.protein_g_100g > 0) {
      // Equivalência proteica
      suggestedGrams = (planItem.protein_g / food.protein_g_100g) * 100;
    } else if ((targetRole === 'carb' || targetRole === 'legume') && planItem.carbohydrate_g > 0 && food.carbohydrate_g_100g > 0) {
      // Equivalência de carboidratos
      suggestedGrams = (planItem.carbohydrate_g / food.carbohydrate_g_100g) * 100;
    } else if (targetRole === 'lipid' && planItem.fat_g > 0 && food.fat_g_100g > 0) {
      // Equivalência lipídica
      suggestedGrams = (planItem.fat_g / food.fat_g_100g) * 100;
    } else {
      // Equivalência calórica
      const energyPer100 = Math.max(10, food.energy_kcal_100g);
      suggestedGrams = (planItem.energy_kcal / energyPer100) * 100;
    }

    // Clamping e arredondamento discreto
    const clampedGrams = Math.max(bounds.minGrams, Math.min(bounds.maxGrams, suggestedGrams));
    const roundedGrams = Math.round(clampedGrams / bounds.stepGrams) * bounds.stepGrams;

    // Calcular valores nutricionais da opção
    const optKcal = Number(((food.energy_kcal_100g * roundedGrams) / 100).toFixed(2));
    const optProtein = Number(((food.protein_g_100g * roundedGrams) / 100).toFixed(2));
    const optCarb = Number(((food.carbohydrate_g_100g * roundedGrams) / 100).toFixed(2));
    const optFat = Number(((food.fat_g_100g * roundedGrams) / 100).toFixed(2));

    const deltaKcal = Number((optKcal - planItem.energy_kcal).toFixed(2));
    const deltaProt = Number((optProtein - planItem.protein_g).toFixed(2));
    const deltaCarb = Number((optCarb - planItem.carbohydrate_g).toFixed(2));
    const deltaFat = Number((optFat - planItem.fat_g).toFixed(2));

    // Custo
    const optPrice = food.price_per_100g !== null ? Number(((food.price_per_100g * roundedGrams) / 100).toFixed(4)) : null;
    const costDelta =
      optPrice !== null && planItem.price_estimate !== null
        ? Number((optPrice - planItem.price_estimate).toFixed(2))
        : null;

    // Medida caseira
    let householdMeasure: { label: string; quantity: number } | null = null;
    if (food.household_measure && food.household_measure.grams > 0) {
      householdMeasure = {
        label: food.household_measure.label,
        quantity: Number((roundedGrams / food.household_measure.grams).toFixed(1)),
      };
    }

    // Reason Codes e Status
    const reasonCodes: string[] = [];
    let isCompatible = true;

    if (Math.abs(deltaKcal) <= 50 && Math.abs(deltaProt) <= 4) {
      reasonCodes.push('EXACT_MACRO_MATCH');
    } else {
      isCompatible = false;
      reasonCodes.push('SLIGHT_MACRO_VARIANCE');
    }

    if ((patientConstraints.favorite_foods || []).some((f) => food.normalized_name.includes(f.toLowerCase()))) {
      reasonCodes.push('PATIENT_FAVORITE');
    }

    if (costDelta !== null && costDelta < 0) {
      reasonCodes.push('LOWER_COST');
    }

    options.push({
      food_id: food.id,
      food_name: food.name,
      food_group: food.food_group,
      suggested_grams: roundedGrams,
      household_measure: householdMeasure,
      energy_kcal: optKcal,
      protein_g: optProtein,
      carbohydrate_g: optCarb,
      fat_g: optFat,
      nutrition_delta: {
        delta_kcal: deltaKcal,
        delta_protein_g: deltaProt,
        delta_carb_g: deltaCarb,
        delta_fat_g: deltaFat,
      },
      cost_delta: costDelta,
      compatibility_status: isCompatible ? 'compatible' : 'review_required',
      reason_codes: reasonCodes,
      price_estimate: optPrice,
      price_confidence: food.price_confidence,
    });
  }

  // Ordenação determinística estrita:
  // 1. Compatíveis primeiro
  // 2. Favoritos do paciente
  // 3. Menor desvio calórico absoluto
  // 4. Menor custo
  // 5. Nome do alimento alfabético, food_id
  options.sort((a, b) => {
    if (a.compatibility_status === 'compatible' && b.compatibility_status !== 'compatible') return -1;
    if (a.compatibility_status !== 'compatible' && b.compatibility_status === 'compatible') return 1;

    const aFav = a.reason_codes.includes('PATIENT_FAVORITE');
    const bFav = b.reason_codes.includes('PATIENT_FAVORITE');
    if (aFav && !bFav) return -1;
    if (!aFav && bFav) return 1;

    const absKcalA = Math.abs(a.nutrition_delta.delta_kcal);
    const absKcalB = Math.abs(b.nutrition_delta.delta_kcal);
    if (absKcalA !== absKcalB) return absKcalA - absKcalB;

    if (a.cost_delta !== null && b.cost_delta !== null && a.cost_delta !== b.cost_delta) {
      return a.cost_delta - b.cost_delta;
    }

    if (a.food_name !== b.food_name) return a.food_name.localeCompare(b.food_name);
    return a.food_id.localeCompare(b.food_id);
  });

  return options;
}
