import { PatientNutritionProfile, PatientNutritionSensitive } from './nutrition-profile';

export type EngineRunStatus =
  | 'calculated'
  | 'insufficient_data'
  | 'review_required'
  | 'blocked'
  | 'superseded';

export type ScreeningReasonCode =
  | 'AGE_REQUIRES_REVIEW'
  | 'PREGNANCY_REPORTED'
  | 'BREASTFEEDING_REPORTED'
  | 'CLINICAL_CONDITION_REPORTED'
  | 'EATING_DISORDER_RISK_REPORTED'
  | 'SEVERE_ALLERGY_REPORTED'
  | 'EXTREME_TARGET_REPORTED'
  | 'ANTHROPOMETRIC_DATA_OUTLIER'
  | 'EXTREME_BMI_REQUIRES_CLINICAL_REVIEW'
  | 'MISSING_REQUIRED_DATA'
  | 'MISSING_OR_INVALID_ACTIVITY_LEVEL'
  | 'GUARDRAIL_CLAMP_APPLIED'
  | 'EXCESSIVE_DEFICIT_REQUESTED'
  | 'EXCESSIVE_SURPLUS_REQUESTED'
  | 'OBESITY_ADJUSTED_MACRO_WEIGHT'
  | 'INSUFFICIENT_CALORIES_FOR_ESSENTIAL_MACROS';

export type BmrFormula = 'mifflin_st_jeor';

export type BudgetEstimateType = 'individual_exact' | 'household_proportional';

/**
 * Estratégia de peso de referência para cálculo de macronutrientes.
 * `adjusted_weight`: Heurística operacional versionada da Engine 1.0 (ex: Wilkens para IMC >= 30),
 * e NÃO uma regra clínica universal. Casos antropométricos fora da faixa suportada permanecem
 * em review_required.
 */
export type MacroReferenceWeightStrategy =
  | 'actual_weight'
  | 'adjusted_weight'
  | 'capped_weight'
  | 'professional_review_required';

export type ClampReason =
  | 'GUARDRAIL_MIN_FLOOR_MALE'
  | 'GUARDRAIL_MIN_FLOOR_FEMALE'
  | 'GUARDRAIL_MAX_CEILING'
  | null;

export interface NutritionConstraints {
  allowed_dietary_pattern: string | null;
  favorite_foods: string[];
  disliked_foods: string[];
  foods_patient_refuses: string[];
  preferred_protein_sources: string[];
  preferred_carbohydrate_sources: string[];
  preferred_fat_sources: string[];
  preferred_fruits: string[];
  preferred_vegetables: string[];
  cuisine_preferences: string[];
  religious_or_cultural_restrictions: string[];
  patient_reported_allergies: string[];
  patient_reported_intolerances: string[];
  patient_reported_clinical_restrictions: string[];
  available_cooking_time_minutes: number | null;
  cooking_skill_level: string | null;
  meal_prep_days: string[];
  available_equipment: {
    has_refrigerator: boolean;
    has_freezer: boolean;
    has_microwave: boolean;
    has_stove: boolean;
    has_air_fryer: boolean;
  };
  logistics: {
    needs_packed_meals: boolean;
    eats_out_frequently: boolean;
    meals_out_per_week: number | null;
    uses_delivery_frequency: string | null;
    eats_at_work: boolean;
    work_refrigerator_available: boolean;
    work_microwave_available: boolean;
  };
  habits: {
    water_intake_liters: number | null;
    coffee_frequency: string | null;
    alcohol_frequency: string | null;
    hunger_pattern: string | null;
    primary_challenges: string[];
  };
  budget_limit: {
    daily_max: number;
    currency: string;
    estimate_type: BudgetEstimateType;
    flexibility: string | null;
  };
}

export interface NutritionTargetData {
  estimated_bmr_kcal: number;
  bmr_formula: BmrFormula;
  bmr_formula_version: string;
  activity_level: string;
  activity_factor: number;
  estimated_tdee_kcal: number;
  primary_goal: string;
  desired_rate_of_change: string | null;
  raw_goal_adjustment_kcal: number;
  goal_adjustment_kcal: number;
  goal_adjustment_percentage: number;
  raw_target_calories_nominal_kcal: number;
  target_calories_nominal_kcal: number;
  target_calories_min_kcal: number;
  target_calories_max_kcal: number;
  target_was_clamped: boolean;
  clamp_reason: ClampReason;
  macro_reference_weight_kg: number;
  macro_reference_weight_strategy: MacroReferenceWeightStrategy;
  protein_g: number;
  carbohydrate_g: number;
  fat_g: number;
  protein_kcal: number;
  carbohydrate_kcal: number;
  fat_kcal: number;
  protein_percentage: number;
  carbohydrate_percentage: number;
  fat_percentage: number;
  desired_meals_per_day: number;
  calories_per_meal_average: number;
  normalized_daily_budget: number;
  normalized_weekly_budget: number;
  normalized_monthly_budget: number;
  currency: string;
  budget_estimate_type: BudgetEstimateType;
  calculation_confidence: number;
}

export interface NutritionEngineInput {
  patient_id: string;
  snapshot: Partial<PatientNutritionProfile>;
  sensitive_snapshot?: Partial<PatientNutritionSensitive> | null;
  professional_notes?: string | null;
  engine_version?: string;
  config_version?: string;
}

export interface NutritionEngineClinicalReviewData {
  requires_professional_review: boolean;
  clinical_reason_codes: ScreeningReasonCode[];
  clinical_review_notes?: string | null;
}

export interface NutritionEngineOutput {
  engine_version: string;
  config_version: string;
  status: EngineRunStatus;
  requires_professional_review: boolean;
  clinical_review: NutritionEngineClinicalReviewData;
  input_hash: string;
  input_snapshot_hash: string;
  safety_input_hash: string;
  engine_config_hash: string;
  output_hash: string;
  targets: NutritionTargetData | null;
  constraints: NutritionConstraints;
}

export interface NutritionEngineRunRow {
  id: string;
  patient_id: string;
  nutrition_snapshot_id: string;
  sensitive_snapshot_id: string | null;
  engine_version: string;
  config_version: string;
  status: EngineRunStatus;
  requires_professional_review: boolean;
  input_hash: string;
  output_hash: string;
  calculated_by: string | null;
  calculated_at: string;
  created_at: string;
}

export interface NutritionEngineClinicalReviewRow {
  id: string;
  engine_run_id: string;
  patient_id: string;
  requires_professional_review: boolean;
  clinical_reason_codes: ScreeningReasonCode[];
  clinical_review_notes: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
}

export interface NutritionTargetRow extends NutritionTargetData {
  id: string;
  engine_run_id: string;
  patient_id: string;
  constraints_data: NutritionConstraints;
  created_at: string;
}
