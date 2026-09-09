/**
 * Tipos e Interfaces do Domínio de Alimentos, Nutrientes e Preços (ETAPA 5).
 */

export type PreparationState =
  | 'raw'
  | 'cooked'
  | 'grilled'
  | 'roasted'
  | 'fried'
  | 'prepared'
  | 'industrialized'
  | 'other';

export type EngineEligibilityStatus =
  | 'eligible_for_engine'
  | 'needs_review'
  | 'incomplete_nutrition'
  | 'disabled';

export type EnergyConsistencyStatus =
  | 'consistent'
  | 'within_tolerance'
  | 'different_from_macro_estimate'
  | 'insufficient_data';

export type ValueStatus =
  | 'KNOWN_NUMERIC_ZERO'
  | 'NUMERIC_VALUE'
  | 'TRACE'
  | 'NOT_APPLICABLE'
  | 'UNDER_REEVALUATION'
  | 'NOT_REQUESTED'
  | 'UNKNOWN';

export type NutrientDataQuality =
  | 'analytical'
  | 'calculated'
  | 'estimated'
  | 'imputed'
  | 'trace'
  | 'not_applicable'
  | 'under_reevaluation'
  | 'not_requested'
  | 'not_available'
  | 'not_analyzed'
  | 'unknown';

export type PriceFreshnessStatus = 'fresh' | 'aging' | 'stale' | 'unknown';

export type PriceSourceType =
  | 'manual_admin'
  | 'professional_input'
  | 'retailer_api'
  | 'public_dataset'
  | 'receipt'
  | 'user_report'
  | 'partner_feed';

export type FoodSourceType =
  | 'official'
  | 'official_table'
  | 'manufacturer_label'
  | 'professional_custom'
  | 'retailer_verified';

export type FoodValidationStatus =
  | 'draft'
  | 'verified_by_nutritionist'
  | 'rejected'
  | 'official_approved';

export type FoodAliasType = 'exact' | 'search_term' | 'colloquial';

export interface FoodDataSource {
  id: string;
  name: string;
  version: string;
  publisher: string;
  reference: string;
  license_notes: string;
  is_active: boolean;
  imported_at: string;
  checksum: string;
}

export interface NutrientDefinition {
  id: string;
  code: string;
  name: string;
  unit: string;
  category: 'macro' | 'mineral' | 'vitamin' | 'lipid' | 'other';
  display_order: number;
}

export interface FoodNutrientAmount {
  nutrient_id: string;
  nutrient_code: string;
  nutrient_name: string;
  unit: string;
  amount_per_100g: number | null; // NULL significa desconhecido / TRACE / NA / *. Zero é zero comprovado!
  raw_value?: string | null;
  numeric_value?: number | null;
  value_status?: ValueStatus;
  data_quality: NutrientDataQuality;
  source_reference?: string | null;
}

export type StructuredAllergen =
  | 'milk'
  | 'egg'
  | 'gluten'
  | 'soy'
  | 'peanut'
  | 'fish'
  | 'shellfish'
  | 'tree_nuts';

export type RestrictionEvaluationStatus = 'allowed' | 'blocked' | 'review_required';

export interface RestrictionEvaluationResult {
  status: RestrictionEvaluationStatus;
  reason?: string;
  violatingAllergens?: string[];
  unverifiedAllergens?: string[];
}

export interface HouseholdMeasure {
  id?: string;
  food_id?: string;
  label: string; // Ex: '1 colher de sopa', '1 concha média', '1 fatia'
  grams: number;
  source: string;
  source_id?: string | null;
  source_reference?: string | null;
  is_estimated: boolean;
}

export interface FoodAlias {
  id?: string;
  food_id?: string;
  alias_name: string;
  normalized_alias: string;
  is_primary: boolean;
  alias_type?: FoodAliasType;
}

export interface FoodCategory {
  id: string;
  code: string; // 'protein_source', 'carbohydrate_source', 'fruit', etc.
  name: string;
  description?: string;
}

export interface FoodTag {
  id: string;
  code: string; // 'vegan', 'vegetarian', 'contains_gluten', 'contains_milk', etc.
  name: string;
  category: 'dietary' | 'allergen' | 'lifestyle';
}

export interface FoodTagMapping {
  food_id: string;
  tag_code: string;
  value: 'true' | 'false' | 'unknown';
  evidence_source?: string | null;
  confidence?: 'high' | 'medium' | 'low' | 'unknown';
  verified_at?: string | null;
}

export interface FoodItem {
  id: string;
  source_id: string;
  source_food_code: string;
  name: string;
  normalized_name: string;
  scientific_name?: string | null;
  food_group: string;
  description?: string | null;
  preparation_state: PreparationState;
  brand?: string | null;
  is_generic: boolean;
  is_active: boolean;
  engine_eligibility_status: EngineEligibilityStatus;
  energy_consistency_status: EnergyConsistencyStatus;
  source_type: FoodSourceType;
  validation_status?: FoodValidationStatus;
  created_by?: string | null;
  organization_id?: string | null;
  created_at: string;
  updated_at: string;
  nutrients?: Record<string, FoodNutrientAmount>;
  household_measures?: HouseholdMeasure[];
  aliases?: string[];
  categories?: string[];
  tags?: Record<string, 'true' | 'false' | 'unknown'>;
}

export interface FoodPriceObservation {
  id: string;
  food_id: string;
  country: string;
  state_region?: string | null;
  city?: string | null;
  retailer?: string | null;
  brand?: string | null;
  package_size_g: number;
  package_price: number;
  currency: string;
  price_per_100g: number;
  price_per_kg: number;
  observed_at: string;
  valid_until?: string | null;
  source_type: PriceSourceType;
  source_reference?: string | null;
  confidence: number;
  entered_by?: string | null;
  created_at: string;
}

export interface PriceEstimateResult {
  food_id: string;
  estimated_price?: number | null;
  estimated_price_per_kg: number | null;
  estimated_price_per_100g: number | null;
  currency: string;
  confidence?: number;
  price_confidence: number; // 0.0 a 1.0
  source_level: 'city' | 'state' | 'national' | 'unknown';
  price_source_level?: 'city' | 'state' | 'region' | 'national' | 'unknown';
  observation_count: number;
  sample_count?: number;
  price_age_days: number | null;
  freshness: PriceFreshnessStatus;
  oldest_observation_at: string | null;
  newest_observation_at: string | null;
  price_engine_version: string;
}

export interface PortionNutritionResult {
  food_id: string;
  food_name: string;
  grams: number;
  measure_label?: string | null;
  nutrients: Record<
    string,
    {
      code: string;
      name: string;
      unit: string;
      amount: number | null;
      data_quality: NutrientDataQuality;
      raw_value?: string | null;
      value_status?: ValueStatus;
    }
  >;
  estimated_portion_cost: number | null;
  currency: string;
}

export interface FoodEconomicNutritionalMetrics {
  food_id: string;
  price_per_kg: number | null;
  cost_per_100g: number | null;
  cost_per_100_kcal: number | null;
  cost_per_10g_protein: number | null;
  currency: string;
}
