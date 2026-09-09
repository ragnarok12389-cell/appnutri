// ==============================================================================
// INTERNAL TYPES: DETERMINISTIC DIET COMPOSER MODULE
// ==============================================================================

import { NutritionConstraints, NutritionTargetData } from '@/types/nutrition-engine';
import { FoodPriceObservation } from '@/types/food';
import {
  DietMealType,
  DietPlan,
  DietPlanGenerationStatus,
  InfeasibleReasonCode,
  MacroAdherenceSummary,
} from '@/types/diet-plan';

export type FoodRole =
  | 'protein'
  | 'carb'
  | 'vegetable'
  | 'fruit'
  | 'lipid'
  | 'dairy'
  | 'legume'
  | 'other';

export interface ComposerCandidateFood {
  id: string;
  source_id?: string | null;
  source_food_code: string;
  name: string;
  normalized_name: string;
  food_group: string;
  source_type: string;
  source_version: string;
  validation_status?: string;
  preparation_state: string;
  energy_kcal_100g: number;
  protein_g_100g: number;
  carbohydrate_g_100g: number;
  fat_g_100g: number;
  fiber_g_100g: number | null;
  sodium_mg_100g: number | null;
  household_measure?: {
    label: string;
    grams: number;
  } | null;
  tags?: Record<string, 'true' | 'false' | 'unknown'>;
  aliases?: string[];
  categories?: string[];
  role: FoodRole;
  price_per_100g: number | null;
  price_confidence: number;
  price_source_level: string;
}

export interface MealSlot {
  slot_order: number;
  role: FoodRole;
  label: string;
  is_optional: boolean;
}

export interface MealTemplate {
  meal_type: DietMealType;
  meal_name: string;
  scheduled_time: string;
  target_kcal_fraction: number;
  target_protein_fraction: number;
  target_carb_fraction: number;
  target_fat_fraction: number;
  slots: MealSlot[];
}

export interface MealMacroTargets {
  calories_kcal: number;
  protein_g: number;
  carbohydrate_g: number;
  fat_g: number;
}

export interface ComposerInput {
  patient_id: string;
  engine_run_id: string;
  nutrition_target_id: string;
  targets: NutritionTargetData;
  constraints: NutritionConstraints;
  food_catalog: ComposerCandidateFood[];
  food_dataset_version: string;
  food_dataset_checksum: string;
  price_engine_version: string;
  generation_reference_at?: string;
  is_budget_hard?: boolean;
  currency?: string;
  price_observations?: FoodPriceObservation[];
  day_count?: number;
  requires_review?: boolean;
}

export interface ComposerExecutionResult {
  success: boolean;
  plan?: DietPlan;
  generation_status: DietPlanGenerationStatus;
  infeasible_reason_codes: InfeasibleReasonCode[];
  adherence?: MacroAdherenceSummary;
  error_message?: string;
}
