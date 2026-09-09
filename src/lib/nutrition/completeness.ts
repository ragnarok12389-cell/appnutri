import { PatientNutritionProfile } from '@/types/nutrition-profile';

/**
 * Cálculo determinístico da completude do Perfil Nutricional (0 a 100%).
 * Avalia 20 campos e seções chave distribuídos pelo questionário.
 * Cada campo preenchido contribui com 5% para a pontuação global.
 */
export function calculateNutritionProfileCompleteness(
  profile: Partial<PatientNutritionProfile>
): number {
  if (!profile) return 0;

  let score = 0;
  const totalItems = 20;

  // 1. Dados Corporais (20%)
  if (profile.height_cm && profile.height_cm > 0) score++;
  if (profile.current_weight_kg && profile.current_weight_kg > 0) score++;
  if (profile.birth_date && profile.birth_date.trim().length > 0) score++;
  if (profile.biological_sex && ['male', 'female'].includes(profile.biological_sex)) score++;

  // 2. Objetivo (5%)
  if (profile.primary_goal && profile.primary_goal.trim().length > 0) score++;

  // 3. Rotina e Atividade Física (20%)
  if (profile.wake_time && profile.wake_time.trim().length > 0) score++;
  if (profile.sleep_time && profile.sleep_time.trim().length > 0) score++;
  if (profile.work_type && profile.work_type.trim().length > 0) score++;
  if (profile.activity_level && profile.activity_level.trim().length > 0) score++;

  // 4. Refeições e Padrão Alimentar (15%)
  if (profile.desired_meals_per_day && profile.desired_meals_per_day >= 1) score++;
  if (profile.dietary_pattern && profile.dietary_pattern.trim().length > 0) score++;
  if (profile.preferred_protein_sources && profile.preferred_protein_sources.length > 0) score++;

  // 5. Preferências / Carboidratos (5%)
  if (profile.preferred_carbohydrate_sources && profile.preferred_carbohydrate_sources.length > 0) score++;

  // 6. Orçamento Alimentar (15%)
  if (profile.food_budget_amount !== undefined && profile.food_budget_amount !== null && profile.food_budget_amount >= 0) score++;
  if (profile.food_budget_period && profile.food_budget_period.trim().length > 0) score++;
  if (profile.number_of_people_in_household && profile.number_of_people_in_household >= 1) score++;

  // 7. Contexto de Compra e Cozinha (10%)
  if (profile.city && profile.city.trim().length > 0) score++;
  if (profile.cooking_skill_level && profile.cooking_skill_level.trim().length > 0) score++;

  // 8. Hábitos e Dificuldades (10%)
  if (profile.water_intake_liters !== undefined && profile.water_intake_liters !== null && profile.water_intake_liters > 0) score++;
  if (profile.primary_challenges && profile.primary_challenges.length > 0) score++;

  const percentage = Math.round((score / totalItems) * 100);
  return Math.min(100, Math.max(0, percentage));
}
