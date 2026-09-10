import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  inferWorkoutEquipment,
  inferWorkoutExperience,
  mapPrimaryGoalToWorkoutObjective,
} from '@/lib/plan-activation/profile-mapping';
import { readCanonicalFoodNutrients } from '@/lib/diet-composer/catalog-mapping';

describe('ETAPA 11B: ativação de planos após o questionário', () => {
  it('mapeia objetivos do perfil para objetivos suportados pelo motor de treino', () => {
    expect(mapPrimaryGoalToWorkoutObjective('gain_muscle')).toBe('hypertrophy');
    expect(mapPrimaryGoalToWorkoutObjective('body_recomposition')).toBe('hypertrophy');
    expect(mapPrimaryGoalToWorkoutObjective('lose_weight')).toBe('weight_loss_support');
    expect(mapPrimaryGoalToWorkoutObjective('improve_performance')).toBe('conditioning_foundation');
    expect(mapPrimaryGoalToWorkoutObjective('improve_health')).toBe('general_fitness');
  });

  it('infere treino conservador sem promover automaticamente o paciente a avançado', () => {
    expect(inferWorkoutExperience({ training_days_per_week: 3, activity_level: 'moderate' })).toBe('beginner');
    expect(inferWorkoutExperience({ training_days_per_week: 5, activity_level: 'high' })).toBe('intermediate');
    expect(inferWorkoutEquipment({ available_workout_equipment: [] })).toEqual(['bodyweight']);
    expect(inferWorkoutEquipment({ available_workout_equipment: ['bodyweight', 'dumbbell', 'dumbbell'] })).toEqual(['bodyweight', 'dumbbell']);
  });

  it('lê os códigos canônicos atuais da TACO e preserva aliases legados', () => {
    const canonical = readCanonicalFoodNutrients([
      { amount_per_100g: 130, nutrients: { code: 'energy_kcal' } },
      { amount_per_100g: 2.5, nutrients: { code: 'protein_g' } },
      { amount_per_100g: 28, nutrients: { code: 'carbohydrate_g' } },
      { amount_per_100g: 0.3, nutrients: { code: 'fat_g' } },
      { amount_per_100g: 1.6, nutrients: { code: 'fiber_g' } },
      { amount_per_100g: 2, nutrients: { code: 'sodium_mg' } },
    ]);
    expect(canonical).toEqual({
      energy_kcal_100g: 130,
      protein_g_100g: 2.5,
      carbohydrate_g_100g: 28,
      fat_g_100g: 0.3,
      fiber_g_100g: 1.6,
      sodium_mg_100g: 2,
    });
    expect(readCanonicalFoodNutrients([{ amount_per_100g: 9, nutrients: { code: 'protein' } }]).protein_g_100g).toBe(9);
  });

  it('persiste estados apenas pelo backend e limita leitura ao próprio paciente', () => {
    const sql = fs.readFileSync(
      path.resolve(__dirname, '../supabase/migrations/20260910000022_plan_activation_tracking.sql'),
      'utf8'
    );
    expect(sql).toContain('UNIQUE (patient_id, profile_version)');
    expect(sql).toContain('ADD COLUMN available_workout_equipment');
    expect(sql).toContain('private.is_patient_owner(patient_id, auth.uid())');
    expect(sql).toContain('REVOKE ALL ON public.patient_plan_activations FROM PUBLIC, anon, authenticated');
    expect(sql).toContain('GRANT ALL ON public.patient_plan_activations TO service_role');
  });
});
