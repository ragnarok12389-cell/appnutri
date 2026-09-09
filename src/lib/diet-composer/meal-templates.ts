// ==============================================================================
// MEAL TEMPLATES: DETERMINISTIC MEAL STRUCTURES AND MACRO FRACTIONS
// ==============================================================================

import { MealTemplate } from './types';

/**
 * Templates operacionais determinísticos de distribuição de refeições.
 * Não assume universalmente que todo paciente come 6 vezes.
 * O número de refeições deriva do perfil/meta (desired_meals_per_day).
 */

export const MEAL_TEMPLATES_3_MEALS: MealTemplate[] = [
  {
    meal_type: 'breakfast',
    meal_name: 'Café da Manhã',
    scheduled_time: '07:30',
    target_kcal_fraction: 0.30,
    target_protein_fraction: 0.25,
    target_carb_fraction: 0.35,
    target_fat_fraction: 0.30,
    slots: [
      { slot_order: 1, role: 'carb', label: 'Cereal / Base Energética', is_optional: false },
      { slot_order: 2, role: 'protein', label: 'Fonte Proteica / Ovos / Laticínio', is_optional: false },
      { slot_order: 3, role: 'fruit', label: 'Fruta Fresca', is_optional: true },
    ],
  },
  {
    meal_type: 'lunch',
    meal_name: 'Almoço',
    scheduled_time: '12:30',
    target_kcal_fraction: 0.40,
    target_protein_fraction: 0.45,
    target_carb_fraction: 0.40,
    target_fat_fraction: 0.35,
    slots: [
      { slot_order: 1, role: 'protein', label: 'Proteína Principal', is_optional: false },
      { slot_order: 2, role: 'carb', label: 'Carboidrato Base / Arroz', is_optional: false },
      { slot_order: 3, role: 'legume', label: 'Leguminosa / Feijão', is_optional: true },
      { slot_order: 4, role: 'vegetable', label: 'Vegetais / Salada', is_optional: false },
      { slot_order: 5, role: 'lipid', label: 'Azeite / Gordura Boa', is_optional: true },
    ],
  },
  {
    meal_type: 'dinner',
    meal_name: 'Jantar',
    scheduled_time: '19:30',
    target_kcal_fraction: 0.30,
    target_protein_fraction: 0.30,
    target_carb_fraction: 0.25,
    target_fat_fraction: 0.35,
    slots: [
      { slot_order: 1, role: 'protein', label: 'Proteína Principal', is_optional: false },
      { slot_order: 2, role: 'carb', label: 'Carboidrato Leve / Tubérculo', is_optional: false },
      { slot_order: 3, role: 'vegetable', label: 'Vegetais / Legumes Cozidos', is_optional: false },
      { slot_order: 4, role: 'lipid', label: 'Azeite / Gordura Boa', is_optional: true },
    ],
  },
];

export const MEAL_TEMPLATES_4_MEALS: MealTemplate[] = [
  {
    meal_type: 'breakfast',
    meal_name: 'Café da Manhã',
    scheduled_time: '07:30',
    target_kcal_fraction: 0.25,
    target_protein_fraction: 0.20,
    target_carb_fraction: 0.30,
    target_fat_fraction: 0.25,
    slots: [
      { slot_order: 1, role: 'carb', label: 'Cereal / Pão / Aveia', is_optional: false },
      { slot_order: 2, role: 'protein', label: 'Fonte Proteica / Ovos / Queijo', is_optional: false },
      { slot_order: 3, role: 'fruit', label: 'Fruta', is_optional: true },
    ],
  },
  {
    meal_type: 'lunch',
    meal_name: 'Almoço',
    scheduled_time: '12:30',
    target_kcal_fraction: 0.35,
    target_protein_fraction: 0.40,
    target_carb_fraction: 0.35,
    target_fat_fraction: 0.35,
    slots: [
      { slot_order: 1, role: 'protein', label: 'Proteína Principal', is_optional: false },
      { slot_order: 2, role: 'carb', label: 'Carboidrato Base / Arroz', is_optional: false },
      { slot_order: 3, role: 'legume', label: 'Feijão / Leguminosa', is_optional: true },
      { slot_order: 4, role: 'vegetable', label: 'Vegetais / Salada', is_optional: false },
      { slot_order: 5, role: 'lipid', label: 'Azeite de Oliva', is_optional: true },
    ],
  },
  {
    meal_type: 'afternoon_snack',
    meal_name: 'Lanche da Tarde',
    scheduled_time: '16:00',
    target_kcal_fraction: 0.15,
    target_protein_fraction: 0.15,
    target_carb_fraction: 0.15,
    target_fat_fraction: 0.15,
    slots: [
      { slot_order: 1, role: 'fruit', label: 'Fruta Fresca', is_optional: false },
      { slot_order: 2, role: 'protein', label: 'Laticínio / Oleaginosa / Proteína', is_optional: true },
    ],
  },
  {
    meal_type: 'dinner',
    meal_name: 'Jantar',
    scheduled_time: '19:30',
    target_kcal_fraction: 0.25,
    target_protein_fraction: 0.25,
    target_carb_fraction: 0.20,
    target_fat_fraction: 0.25,
    slots: [
      { slot_order: 1, role: 'protein', label: 'Proteína Principal', is_optional: false },
      { slot_order: 2, role: 'carb', label: 'Carboidrato Base', is_optional: false },
      { slot_order: 3, role: 'vegetable', label: 'Vegetais Cozidos ou Salada', is_optional: false },
      { slot_order: 4, role: 'lipid', label: 'Azeite / Gordura Boa', is_optional: true },
    ],
  },
];

export const MEAL_TEMPLATES_5_MEALS: MealTemplate[] = [
  {
    meal_type: 'breakfast',
    meal_name: 'Café da Manhã',
    scheduled_time: '07:30',
    target_kcal_fraction: 0.20,
    target_protein_fraction: 0.20,
    target_carb_fraction: 0.25,
    target_fat_fraction: 0.20,
    slots: [
      { slot_order: 1, role: 'carb', label: 'Cereal / Base', is_optional: false },
      { slot_order: 2, role: 'protein', label: 'Proteína / Ovos / Lácteo', is_optional: false },
      { slot_order: 3, role: 'fruit', label: 'Fruta', is_optional: true },
    ],
  },
  {
    meal_type: 'morning_snack',
    meal_name: 'Lanche da Manhã',
    scheduled_time: '10:00',
    target_kcal_fraction: 0.10,
    target_protein_fraction: 0.10,
    target_carb_fraction: 0.10,
    target_fat_fraction: 0.10,
    slots: [
      { slot_order: 1, role: 'fruit', label: 'Fruta ou Iogurte', is_optional: false },
    ],
  },
  {
    meal_type: 'lunch',
    meal_name: 'Almoço',
    scheduled_time: '12:30',
    target_kcal_fraction: 0.35,
    target_protein_fraction: 0.35,
    target_carb_fraction: 0.35,
    target_fat_fraction: 0.35,
    slots: [
      { slot_order: 1, role: 'protein', label: 'Proteína Principal', is_optional: false },
      { slot_order: 2, role: 'carb', label: 'Carboidrato Base', is_optional: false },
      { slot_order: 3, role: 'legume', label: 'Leguminosa / Feijão', is_optional: true },
      { slot_order: 4, role: 'vegetable', label: 'Vegetais / Salada', is_optional: false },
      { slot_order: 5, role: 'lipid', label: 'Azeite / Gordura', is_optional: true },
    ],
  },
  {
    meal_type: 'afternoon_snack',
    meal_name: 'Lanche da Tarde',
    scheduled_time: '16:00',
    target_kcal_fraction: 0.15,
    target_protein_fraction: 0.15,
    target_carb_fraction: 0.15,
    target_fat_fraction: 0.15,
    slots: [
      { slot_order: 1, role: 'carb', label: 'Base de Carboidrato / Fruta', is_optional: false },
      { slot_order: 2, role: 'protein', label: 'Proteína Leve / Castanhas', is_optional: true },
    ],
  },
  {
    meal_type: 'dinner',
    meal_name: 'Jantar',
    scheduled_time: '19:30',
    target_kcal_fraction: 0.20,
    target_protein_fraction: 0.20,
    target_carb_fraction: 0.15,
    target_fat_fraction: 0.20,
    slots: [
      { slot_order: 1, role: 'protein', label: 'Proteína Principal', is_optional: false },
      { slot_order: 2, role: 'carb', label: 'Carboidrato Leve', is_optional: false },
      { slot_order: 3, role: 'vegetable', label: 'Vegetais / Salada', is_optional: false },
      { slot_order: 4, role: 'lipid', label: 'Azeite / Gordura', is_optional: true },
    ],
  },
];

export function getMealTemplatesForCount(desiredMealsPerDay: number): MealTemplate[] {
  if (desiredMealsPerDay <= 3) {
    return MEAL_TEMPLATES_3_MEALS;
  }
  if (desiredMealsPerDay === 5 || desiredMealsPerDay >= 6) {
    return MEAL_TEMPLATES_5_MEALS;
  }
  // Default: 4 refeições
  return MEAL_TEMPLATES_4_MEALS;
}
