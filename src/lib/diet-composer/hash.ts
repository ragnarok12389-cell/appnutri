// ==============================================================================
// HASHING: DETERMINISTIC SHA-256 HASHING FOR INPUTS, SNAPSHOTS AND DIET PLANS
// ==============================================================================

import crypto from 'crypto';
import { NutritionConstraints, NutritionTargetData } from '@/types/nutrition-engine';
import { DietPlanDay } from '@/types/diet-plan';

export function canonicalJsonStringify(obj: unknown): string {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }

  if (Array.isArray(obj)) {
    return '[' + obj.map((item) => canonicalJsonStringify(item)).join(',') + ']';
  }

  const sortedKeys = Object.keys(obj as Record<string, unknown>).sort();
  const pairs = sortedKeys.map((key) => {
    const val = (obj as Record<string, unknown>)[key];
    return JSON.stringify(key) + ':' + canonicalJsonStringify(val);
  });

  return '{' + pairs.join(',') + '}';
}

export function calculateSha256(data: unknown): string {
  const canonicalStr = canonicalJsonStringify(data);
  return crypto.createHash('sha256').update(canonicalStr).digest('hex');
}

/**
 * Calcula o hash imutável de composição nutricional de um alimento por 100g.
 */
export function computeCompositionSnapshotHash(food: {
  food_id: string;
  energy_kcal: number;
  protein_g: number;
  carbohydrate_g: number;
  fat_g: number;
  fiber_g?: number | null;
  sodium_mg?: number | null;
}): string {
  return calculateSha256({
    food_id: food.food_id,
    energy_kcal: Number(food.energy_kcal.toFixed(2)),
    protein_g: Number(food.protein_g.toFixed(2)),
    carbohydrate_g: Number(food.carbohydrate_g.toFixed(2)),
    fat_g: Number(food.fat_g.toFixed(2)),
    fiber_g: food.fiber_g !== null && food.fiber_g !== undefined ? Number(food.fiber_g.toFixed(2)) : null,
    sodium_mg: food.sodium_mg !== null && food.sodium_mg !== undefined ? Number(food.sodium_mg.toFixed(2)) : null,
  });
}

/**
 * Calcula o hash determinístico de entrada para a geração do plano alimentar.
 */
export function computeInputSnapshotHash(params: {
  patient_id: string;
  targets: NutritionTargetData;
  constraints: NutritionConstraints;
  eligible_food_ids: string[];
  composer_version: string;
  composer_config_version: string;
  food_dataset_checksum: string;
  generation_reference_at?: string;
}): string {
  return calculateSha256({
    patient_id: params.patient_id,
    composer_version: params.composer_version,
    composer_config_version: params.composer_config_version,
    food_dataset_checksum: params.food_dataset_checksum,
    generation_reference_at: params.generation_reference_at || null,
    targets: {
      target_calories_nominal_kcal: params.targets.target_calories_nominal_kcal,
      protein_g: params.targets.protein_g,
      carbohydrate_g: params.targets.carbohydrate_g,
      fat_g: params.targets.fat_g,
      desired_meals_per_day: params.targets.desired_meals_per_day,
      normalized_daily_budget: params.targets.normalized_daily_budget,
      currency: params.targets.currency,
    },
    constraints: {
      allowed_dietary_pattern: params.constraints.allowed_dietary_pattern,
      favorite_foods: [...(params.constraints.favorite_foods || [])].sort(),
      disliked_foods: [...(params.constraints.disliked_foods || [])].sort(),
      foods_patient_refuses: [...(params.constraints.foods_patient_refuses || [])].sort(),
      patient_reported_allergies: [...(params.constraints.patient_reported_allergies || [])].sort(),
      preferred_protein_sources: [...(params.constraints.preferred_protein_sources || [])].sort(),
      preferred_carbohydrate_sources: [...(params.constraints.preferred_carbohydrate_sources || [])].sort(),
      preferred_fat_sources: [...(params.constraints.preferred_fat_sources || [])].sort(),
    },
    eligible_food_ids: [...params.eligible_food_ids].sort(),
  });
}

/**
 * Calcula o hash determinístico da saída do plano alimentar (dias, refeições, itens e gramagens).
 * EXCLUI estritamente UUIDs aleatórios e timestamps operacionais voláteis.
 */
export function computeOutputPlanHash(days: DietPlanDay[]): string {
  const canonicalStructure = days.map((day) => ({
    day_of_week: day.day_of_week,
    actual_calories_kcal: Number(day.actual_calories_kcal.toFixed(2)),
    actual_protein_g: Number(day.actual_protein_g.toFixed(2)),
    actual_carbohydrate_g: Number(day.actual_carbohydrate_g.toFixed(2)),
    actual_fat_g: Number(day.actual_fat_g.toFixed(2)),
    meals: day.meals.map((meal) => ({
      meal_order: meal.meal_order,
      meal_type: meal.meal_type,
      actual_calories_kcal: Number(meal.actual_calories_kcal.toFixed(2)),
      actual_protein_g: Number(meal.actual_protein_g.toFixed(2)),
      actual_carbohydrate_g: Number(meal.actual_carbohydrate_g.toFixed(2)),
      actual_fat_g: Number(meal.actual_fat_g.toFixed(2)),
      items: meal.items.map((item) => ({
        food_id: item.food_id,
        food_name: item.food_name,
        grams: Number(item.grams.toFixed(2)),
        energy_kcal: Number(item.energy_kcal.toFixed(2)),
        protein_g: Number(item.protein_g.toFixed(2)),
        carbohydrate_g: Number(item.carbohydrate_g.toFixed(2)),
        fat_g: Number(item.fat_g.toFixed(2)),
        price_estimate: item.price_estimate !== null ? Number(item.price_estimate.toFixed(4)) : null,
        composition_snapshot_hash: item.composition_snapshot_hash,
      })),
    })),
  }));

  return calculateSha256(canonicalStructure);
}
