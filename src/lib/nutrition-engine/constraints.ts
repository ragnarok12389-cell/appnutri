import { PatientNutritionProfile, PatientNutritionSensitive } from '@/types/nutrition-profile';
import { NutritionConstraints, BudgetEstimateType } from '@/types/nutrition-engine';

export function buildNutritionConstraints(
  snapshot: Partial<PatientNutritionProfile>,
  sensitiveSnapshot?: Partial<PatientNutritionSensitive> | null,
  normalizedDailyBudget: number = 20,
  budgetEstimateType: BudgetEstimateType = 'individual_exact',
  currency: string = 'BRL'
): NutritionConstraints {
  return {
    allowed_dietary_pattern: snapshot.dietary_pattern || 'omnivore',
    favorite_foods: snapshot.favorite_foods || [],
    disliked_foods: snapshot.disliked_foods || [],
    foods_patient_refuses: snapshot.foods_patient_refuses || [],
    preferred_protein_sources: snapshot.preferred_protein_sources || [],
    preferred_carbohydrate_sources: snapshot.preferred_carbohydrate_sources || [],
    preferred_fat_sources: snapshot.preferred_fat_sources || [],
    preferred_fruits: snapshot.preferred_fruits || [],
    preferred_vegetables: snapshot.preferred_vegetables || [],
    cuisine_preferences: snapshot.cuisine_preferences || [],
    religious_or_cultural_restrictions: snapshot.religious_or_cultural_restrictions || [],

    // Restrições clínicas e alergias relatadas (da camada sensível)
    patient_reported_allergies: sensitiveSnapshot?.food_allergies || [],
    patient_reported_intolerances: sensitiveSnapshot?.food_intolerances || [],
    patient_reported_clinical_restrictions: sensitiveSnapshot?.clinical_dietary_restrictions || [],

    available_cooking_time_minutes: snapshot.available_cooking_time_minutes ?? 30,
    cooking_skill_level: snapshot.cooking_skill_level || 'basic',
    meal_prep_days: snapshot.meal_prep_days || [],

    available_equipment: {
      has_refrigerator: snapshot.has_refrigerator ?? true,
      has_freezer: snapshot.has_freezer ?? true,
      has_microwave: snapshot.has_microwave ?? true,
      has_stove: snapshot.has_stove ?? true,
      has_air_fryer: snapshot.has_air_fryer ?? false,
    },

    logistics: {
      needs_packed_meals: snapshot.needs_packed_meals ?? false,
      eats_out_frequently: snapshot.eats_out_frequently ?? false,
      meals_out_per_week: snapshot.meals_out_per_week ?? 0,
      uses_delivery_frequency: snapshot.uses_delivery_frequency ?? 'never',
      eats_at_work: snapshot.eats_at_work ?? false,
      work_refrigerator_available: snapshot.work_refrigerator_available ?? false,
      work_microwave_available: snapshot.work_microwave_available ?? false,
    },

    habits: {
      water_intake_liters: snapshot.water_intake_liters ?? 2.0,
      coffee_frequency: snapshot.coffee_frequency ?? '1_cup_day',
      alcohol_frequency: snapshot.alcohol_frequency ?? 'never',
      hunger_pattern: snapshot.hunger_pattern ?? 'afternoon',
      primary_challenges: (snapshot.primary_challenges as string[]) || [],
    },

    budget_limit: {
      daily_max: normalizedDailyBudget,
      currency,
      estimate_type: budgetEstimateType,
      flexibility: snapshot.budget_flexibility || 'moderate',
    },
  };
}
