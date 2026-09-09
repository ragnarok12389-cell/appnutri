// ==============================================================================
// DOMAIN TYPES: DETERMINISTIC DIET PLAN, MEALS, ITEMS & SUBSTITUTIONS (ETAPA 6)
// ==============================================================================

export type DietPlanGenerationStatus =
  | 'calculated'
  | 'review_required'
  | 'infeasible'
  | 'superseded';

export type DietPlanApprovalStatus =
  | 'draft'
  | 'approved'
  | 'rejected'
  | 'superseded';

export type DietPlanBudgetStatus =
  | 'within_budget'
  | 'exceeds_budget'
  | 'budget_unverified';

export type DietMealType =
  | 'breakfast'
  | 'morning_snack'
  | 'lunch'
  | 'afternoon_snack'
  | 'dinner'
  | 'supper'
  | 'custom';

export type InfeasibleReasonCode =
  | 'NO_ELIGIBLE_FOODS'
  | 'NO_COMPATIBLE_PROTEIN_SOURCE'
  | 'ALLERGEN_DATA_UNCERTAIN'
  | 'MACRO_TARGET_UNREACHABLE'
  | 'ENERGY_TARGET_UNREACHABLE'
  | 'BUDGET_INSUFFICIENT'
  | 'PRICE_COVERAGE_INSUFFICIENT'
  | 'INVALID_MEAL_COUNT';

export type MacroAdherenceStatus = 'within_tolerance' | 'out_of_tolerance';

export interface MacroAdherenceReportItem {
  target: number;
  actual: number;
  absolute_delta: number;
  percentage_delta: number;
  status: 'within_tolerance' | 'exceeds' | 'below';
}

export interface MacroAdherenceSummary {
  calories: MacroAdherenceReportItem;
  protein: MacroAdherenceReportItem;
  carbohydrate: MacroAdherenceReportItem;
  fat: MacroAdherenceReportItem;
  overall_status: MacroAdherenceStatus;
}

export interface DietMealItemSnapshot {
  id?: string;
  diet_meal_id?: string;
  food_id: string;
  item_order: number;
  food_name: string;
  source_id: string | null;
  source_food_code: string | null;
  source_type: string;
  source_version: string;
  grams: number;
  energy_kcal: number;
  protein_g: number;
  carbohydrate_g: number;
  fat_g: number;
  fiber_g: number | null;
  sodium_mg: number | null;
  household_measure_label: string | null;
  household_measure_quantity: number | null;
  price_estimate: number | null;
  price_confidence: number;
  price_source_level: string;
  currency: string;
  composition_snapshot_hash: string;
  created_at?: string;
}

export interface DietMeal {
  id?: string;
  diet_plan_day_id?: string;
  meal_order: number;
  meal_type: DietMealType;
  meal_name: string;
  scheduled_time: string | null;
  target_calories_kcal: number;
  target_protein_g: number;
  target_carbohydrate_g: number;
  target_fat_g: number;
  actual_calories_kcal: number;
  actual_protein_g: number;
  actual_carbohydrate_g: number;
  actual_fat_g: number;
  actual_fiber_g: number;
  actual_sodium_mg: number;
  estimated_cost: number | null;
  items: DietMealItemSnapshot[];
  created_at?: string;
}

export interface DietPlanDay {
  id?: string;
  diet_plan_id?: string;
  day_of_week: number;
  day_label: string;
  target_calories_kcal: number;
  target_protein_g: number;
  target_carbohydrate_g: number;
  target_fat_g: number;
  actual_calories_kcal: number;
  actual_protein_g: number;
  actual_carbohydrate_g: number;
  actual_fat_g: number;
  actual_fiber_g: number;
  actual_sodium_mg: number;
  calories_delta_pct: number;
  protein_delta_pct: number;
  carbohydrate_delta_pct: number;
  fat_delta_pct: number;
  adherence_status: MacroAdherenceStatus;
  estimated_cost: number | null;
  meals: DietMeal[];
  created_at?: string;
}

export interface DietPlan {
  id: string;
  patient_id: string;
  source_nutrition_engine_run_id: string;
  source_nutrition_target_id: string;
  composer_version: string;
  composer_config_version: string;
  food_dataset_version: string;
  food_dataset_checksum: string;
  price_engine_version: string;
  generation_reference_at: string;
  input_snapshot_hash: string;
  output_plan_hash: string;
  generation_status: DietPlanGenerationStatus;
  approval_status: DietPlanApprovalStatus;
  rejection_reason: string | null;
  infeasible_reason_codes: InfeasibleReasonCode[];
  day_count: number;
  daily_budget_target: number | null;
  estimated_daily_cost: number | null;
  estimated_weekly_cost: number | null;
  budget_confidence: number;
  budget_status: DietPlanBudgetStatus;
  currency: string;
  price_coverage_percentage: number;
  version: number;
  superseded_by: string | null;
  is_active: boolean;
  created_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
  days: DietPlanDay[];
}

export interface FoodSubstitutionOption {
  food_id: string;
  food_name: string;
  food_group: string;
  suggested_grams: number;
  household_measure: {
    label: string;
    quantity: number;
  } | null;
  energy_kcal: number;
  protein_g: number;
  carbohydrate_g: number;
  fat_g: number;
  nutrition_delta: {
    delta_kcal: number;
    delta_protein_g: number;
    delta_carb_g: number;
    delta_fat_g: number;
  };
  cost_delta: number | null;
  compatibility_status: 'compatible' | 'review_required' | 'incompatible';
  reason_codes: string[];
  price_estimate: number | null;
  price_confidence: number;
}
