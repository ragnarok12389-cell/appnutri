import { z } from 'zod';

// Step 1: Sobre você (Dados corporais)
export const step1BodySchema = z.object({
  height_cm: z.number().min(50, 'Altura deve ser maior que 50 cm').max(260, 'Altura deve ser menor que 260 cm').optional().nullable(),
  current_weight_kg: z.number().min(20, 'Peso deve ser maior que 20 kg').max(400, 'Peso deve ser menor que 400 kg').optional().nullable(),
  target_weight_kg: z.number().min(20, 'Peso alvo deve ser maior que 20 kg').max(400, 'Peso alvo deve ser menor que 400 kg').optional().nullable(),
  birth_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data de nascimento deve estar no formato AAAA-MM-DD').optional().nullable(),
  biological_sex: z.enum(['male', 'female'], { message: 'Selecione o sexo biológico' }).optional().nullable(),
  waist_cm: z.number().min(30).max(250).optional().nullable(),
  body_fat_percentage: z.number().min(2).max(70).optional().nullable(),
});

// Step 2: Seu objetivo
export const step2GoalSchema = z.object({
  primary_goal: z.enum([
    'lose_weight',
    'gain_muscle',
    'maintain_weight',
    'body_recomposition',
    'improve_health',
    'improve_performance',
  ], { message: 'Selecione um objetivo primário válido' }).optional().nullable(),
  desired_rate_of_change: z.enum(['slow', 'moderate', 'fast']).optional().nullable(),
  target_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
});

// Step 3: Sua rotina & atividade
export const step3RoutineSchema = z.object({
  wake_time: z.string().optional().nullable(),
  sleep_time: z.string().optional().nullable(),
  average_sleep_hours: z.number().min(1).max(24).optional().nullable(),
  work_start_time: z.string().optional().nullable(),
  work_end_time: z.string().optional().nullable(),
  work_type: z.enum(['sedentary', 'mixed', 'physical']).optional().nullable(),
  usual_training_time: z.string().optional().nullable(),
  weekday_routine: z.string().max(1000).optional().nullable(),
  weekend_routine: z.string().max(1000).optional().nullable(),
  activity_level: z.enum(['sedentary', 'light', 'moderate', 'high', 'very_high']).optional().nullable(),
  training_days_per_week: z.number().int().min(0).max(7).optional().nullable(),
  training_duration_minutes: z.number().int().min(0).max(360).optional().nullable(),
  training_types: z.array(z.string()).default([]),
  available_workout_equipment: z.array(z.enum([
    'barbell',
    'dumbbell',
    'cable',
    'machine',
    'bodyweight',
    'bench',
    'pull_up_bar',
    'resistance_band',
  ])).min(1, 'Selecione ao menos uma opção de equipamento').default(['bodyweight']),
});

// Step 4: Sua alimentação & refeições
export const step4MealsSchema = z.object({
  desired_meals_per_day: z.number().int().min(1).max(10).optional().nullable(),
  usual_meals_per_day: z.number().int().min(1).max(10).optional().nullable(),
  breakfast_habit: z.string().max(500).optional().nullable(),
  lunch_habit: z.string().max(500).optional().nullable(),
  dinner_habit: z.string().max(500).optional().nullable(),
  snacks_habit: z.string().max(500).optional().nullable(),
  meal_schedules: z.array(
    z.object({
      meal_name: z.string(),
      approx_time: z.string(),
      is_custom: z.boolean().optional(),
    })
  ).default([]),
  skips_breakfast: z.boolean().default(false),
  irregular_work_schedule: z.boolean().default(false),
  works_night_shifts: z.boolean().default(false),
  eats_out_frequently: z.boolean().default(false),
  needs_packed_meals: z.boolean().default(false),
});

// Step 5: Preferências e restrições
export const step5PreferencesSchema = z.object({
  dietary_pattern: z.enum(['omnivore', 'vegetarian', 'vegan', 'pescatarian', 'other']).optional().nullable(),
  uses_supplements: z.boolean().default(false),
  current_supplements: z.array(z.string()).default([]),
  favorite_foods: z.array(z.string()).default([]),
  disliked_foods: z.array(z.string()).default([]),
  foods_patient_refuses: z.array(z.string()).default([]),
  preferred_protein_sources: z.array(z.string()).default([]),
  preferred_carbohydrate_sources: z.array(z.string()).default([]),
  preferred_fat_sources: z.array(z.string()).default([]),
  preferred_fruits: z.array(z.string()).default([]),
  preferred_vegetables: z.array(z.string()).default([]),
  cuisine_preferences: z.array(z.string()).default([]),
  food_allergies: z.array(z.string()).default([]),
  food_intolerances: z.array(z.string()).default([]),
  dietary_restrictions: z.array(z.string()).default([]),
  religious_or_cultural_restrictions: z.array(z.string()).default([]),
  medical_dietary_notes: z.string().max(2000).optional().nullable(),
});

// Step 6: Seu orçamento & compras
export const step6BudgetSchema = z.object({
  food_budget_amount: z.number().min(0, 'Orçamento não pode ser negativo').optional().nullable(),
  food_budget_period: z.enum(['daily', 'weekly', 'monthly']).optional().nullable(),
  currency: z.string().default('BRL'),
  budget_flexibility: z.enum(['strict', 'moderate', 'flexible']).optional().nullable(),
  number_of_people_in_household: z.number().int().min(1, 'Número de pessoas deve ser no mínimo 1').optional().nullable(),
  is_budget_exclusive_for_patient: z.boolean().default(true),
  country: z.string().default('BR'),
  state_region: z.string().max(100).optional().nullable(),
  city: z.string().max(100).optional().nullable(),
  preferred_stores: z.array(z.string()).default([]),
  shopping_frequency: z.enum(['daily', 'weekly', 'biweekly', 'monthly']).optional().nullable(),
});

// Step 7: Cozinha e contexto de preparo
export const step7KitchenSchema = z.object({
  can_cook: z.boolean().default(true),
  cooking_skill_level: z.enum(['none', 'basic', 'intermediate', 'advanced']).optional().nullable(),
  available_cooking_time_minutes: z.number().int().min(0).max(1440).optional().nullable(),
  meal_prep_days: z.array(z.string()).default([]),
  has_refrigerator: z.boolean().default(true),
  has_freezer: z.boolean().default(true),
  has_microwave: z.boolean().default(true),
  has_stove: z.boolean().default(true),
  has_air_fryer: z.boolean().default(false),
  meals_out_per_week: z.number().int().min(0).max(50).optional().nullable(),
  uses_delivery_frequency: z.enum(['never', 'rarely', 'weekly_1_2', 'weekly_3_4', 'daily']).optional().nullable(),
  eats_at_work: z.boolean().default(false),
  work_refrigerator_available: z.boolean().default(false),
  work_microwave_available: z.boolean().default(false),
  water_intake_liters: z.number().min(0).max(20).optional().nullable(),
  alcohol_frequency: z.enum(['never', 'rarely', 'weekly_social', 'weekly_frequent', 'daily']).optional().nullable(),
  soft_drink_frequency: z.enum(['never', 'rarely', 'weekly_1_2', 'weekly_3_4', 'daily']).optional().nullable(),
  coffee_frequency: z.enum(['never', '1_cup_day', '2_3_cups_day', '4_plus_cups_day']).optional().nullable(),
  fast_food_frequency: z.enum(['never', 'rarely', 'weekly_1_2', 'weekly_3_4', 'daily']).optional().nullable(),
  late_night_eating: z.boolean().default(false),
  emotional_eating_reported: z.boolean().default(false),
  hunger_pattern: z.enum(['morning', 'afternoon', 'evening', 'night', 'constant', 'variable']).optional().nullable(),
  primary_challenges: z.array(z.enum([
    'lack_of_time',
    'budget',
    'hunger',
    'cravings',
    'consistency',
    'cooking',
    'eating_out',
    'social_events',
    'lack_of_knowledge',
    'other',
  ])).default([]),
  challenges_notes: z.string().max(1000).optional().nullable(),
  followed_diet_before: z.boolean().default(false),
  what_worked_before: z.string().max(1000).optional().nullable(),
  what_failed_before: z.string().max(1000).optional().nullable(),
  foods_or_methods_refused: z.string().max(1000).optional().nullable(),
});

// Full unified schema for deep validation
export const fullNutritionProfileSchema = step1BodySchema
  .merge(step2GoalSchema)
  .merge(step3RoutineSchema)
  .merge(step4MealsSchema)
  .merge(step5PreferencesSchema)
  .merge(step6BudgetSchema)
  .merge(step7KitchenSchema);

export type FullNutritionProfileInput = z.infer<typeof fullNutritionProfileSchema>;
