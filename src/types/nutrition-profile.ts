export type BiologicalSex = 'male' | 'female';

export type PrimaryGoal =
  | 'lose_weight'
  | 'gain_muscle'
  | 'maintain_weight'
  | 'body_recomposition'
  | 'improve_health'
  | 'improve_performance';

export type RateOfChange = 'slow' | 'moderate' | 'fast';

export type WorkType = 'sedentary' | 'mixed' | 'physical';

export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'high' | 'very_high';

export type DietaryPattern = 'omnivore' | 'vegetarian' | 'vegan' | 'pescatarian' | 'other';

export type BudgetPeriod = 'daily' | 'weekly' | 'monthly';

export type BudgetFlexibility = 'strict' | 'moderate' | 'flexible';

export type ShoppingFrequency = 'daily' | 'weekly' | 'biweekly' | 'monthly';

export type CookingSkillLevel = 'none' | 'basic' | 'intermediate' | 'advanced';

export type FrequencyOption = 'never' | 'rarely' | 'weekly_1_2' | 'weekly_3_4' | 'daily' | 'weekly_social' | 'weekly_frequent';

export type CoffeeFrequency = 'never' | '1_cup_day' | '2_3_cups_day' | '4_plus_cups_day';

export type HungerPattern = 'morning' | 'afternoon' | 'evening' | 'night' | 'constant' | 'variable';

export type NutritionChallenge =
  | 'lack_of_time'
  | 'budget'
  | 'hunger'
  | 'cravings'
  | 'consistency'
  | 'cooking'
  | 'eating_out'
  | 'social_events'
  | 'lack_of_knowledge'
  | 'other';

export interface MealScheduleItem {
  meal_name: string;
  approx_time: string;
  is_custom?: boolean;
}

export interface PatientNutritionProfile {
  id: string; // matches patient_id
  patient_id?: string;

  // 1. Dados Corporais
  height_cm: number | null;
  current_weight_kg: number | null;
  target_weight_kg: number | null;
  birth_date: string | null;
  biological_sex: BiologicalSex | null;
  waist_cm: number | null;
  body_fat_percentage: number | null;

  // 2. Objetivo
  primary_goal: PrimaryGoal | null;
  desired_rate_of_change: RateOfChange | null;
  target_date: string | null;

  // 3. Rotina Diária
  wake_time: string | null;
  sleep_time: string | null;
  average_sleep_hours: number | null;
  work_start_time: string | null;
  work_end_time: string | null;
  work_type: WorkType | null;
  usual_training_time: string | null;
  weekday_routine: string | null;
  weekend_routine: string | null;

  // 4. Atividade Física
  activity_level: ActivityLevel | null;
  training_days_per_week: number | null;
  training_duration_minutes: number | null;
  training_types: string[];

  // 5. Refeições e Contexto
  desired_meals_per_day: number | null;
  usual_meals_per_day: number | null;
  breakfast_habit: string | null;
  lunch_habit: string | null;
  dinner_habit: string | null;
  snacks_habit: string | null;
  meal_schedules: MealScheduleItem[];
  skips_breakfast: boolean;
  irregular_work_schedule: boolean;
  works_night_shifts: boolean;
  eats_out_frequently: boolean;
  needs_packed_meals: boolean;

  // 6. Padrões e Preferências Alimentares
  dietary_pattern: DietaryPattern | null;
  uses_supplements: boolean;
  current_supplements: string[];
  favorite_foods: string[];
  disliked_foods: string[];
  foods_patient_refuses: string[];
  preferred_protein_sources: string[];
  preferred_carbohydrate_sources: string[];
  preferred_fat_sources: string[];
  preferred_fruits: string[];
  preferred_vegetables: string[];
  cuisine_preferences: string[];

  // 7. Preferências Culturais e Religiosas (Não-clínicas)
  religious_or_cultural_restrictions: string[];

  // 8. Orçamento Alimentar
  food_budget_amount: number | null;
  food_budget_period: BudgetPeriod | null;
  currency: string;
  budget_flexibility: BudgetFlexibility | null;
  number_of_people_in_household: number | null;
  is_budget_exclusive_for_patient: boolean;

  // 9. Contexto de Compra
  country: string;
  state_region: string | null;
  city: string | null;
  preferred_stores: string[];
  shopping_frequency: ShoppingFrequency | null;

  // 10. Cozinha e Contexto
  can_cook: boolean;
  cooking_skill_level: CookingSkillLevel | null;
  available_cooking_time_minutes: number | null;
  meal_prep_days: string[];
  has_refrigerator: boolean;
  has_freezer: boolean;
  has_microwave: boolean;
  has_stove: boolean;
  has_air_fryer: boolean;
  meals_out_per_week: number | null;
  uses_delivery_frequency: FrequencyOption | null;
  eats_at_work: boolean;
  work_refrigerator_available: boolean;
  work_microwave_available: boolean;

  // 11. Hábitos Gerais e Dificuldades
  water_intake_liters: number | null;
  alcohol_frequency: FrequencyOption | null;
  soft_drink_frequency: FrequencyOption | null;
  coffee_frequency: CoffeeFrequency | null;
  fast_food_frequency: FrequencyOption | null;
  late_night_eating: boolean;
  emotional_eating_reported: boolean;
  hunger_pattern: HungerPattern | null;
  primary_challenges: NutritionChallenge[];
  challenges_notes: string | null;
  followed_diet_before: boolean;
  what_worked_before: string | null;
  what_failed_before: string | null;
  foods_or_methods_refused: string | null;

  // Metadados
  completion_percentage: number;
  is_completed: boolean;
  version: number;
  last_updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface PatientNutritionSensitive {
  id?: string;
  patient_id: string;
  food_allergies: string[];
  food_intolerances: string[];
  medical_dietary_notes: string | null;
  clinical_dietary_restrictions: string[];
  has_reported_clinical_condition?: boolean;
  is_pregnant?: boolean;
  is_breastfeeding?: boolean;
  has_eating_disorder_history?: boolean;
  has_severe_allergies?: boolean;
  last_updated_by?: string | null;
  created_at?: string;
  updated_at?: string;
}

export type FullPatientNutritionData = PatientNutritionProfile & Partial<PatientNutritionSensitive>;

export interface PatientNutritionSnapshot {
  id: string;
  patient_id: string;
  version: number;
  snapshot_data: Partial<PatientNutritionProfile>;
  completion_percentage: number;
  created_by: string | null;
  change_summary: string | null;
  created_at: string;
}

export interface PatientNutritionSensitiveSnapshot {
  id: string;
  patient_id: string;
  version: number;
  snapshot_data: Partial<PatientNutritionSensitive>;
  created_by: string | null;
  created_at: string;
}
