import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  inferWorkoutEquipment,
  inferWorkoutExperience,
  mapPrimaryGoalToWorkoutObjective,
} from '@/lib/plan-activation/profile-mapping';
import { readCanonicalFoodNutrients } from '@/lib/diet-composer/catalog-mapping';
import { inferOfficialAllergenEvidence } from '@/lib/foods/official-allergen-evidence';
import { filterEligibleFoods, inferFoodRole } from '@/lib/diet-composer/candidate-filter';
import type { ComposerCandidateFood } from '@/lib/diet-composer/types';
import type { NutritionConstraints } from '@/types/nutrition-engine';
import { exerciseCodeToUuid, toPersistedExercise } from '@/lib/workout-engine/catalog-persistence';
import { CURATED_EXERCISE_CATALOG } from '@/lib/workout-engine/catalog';

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

  it('usa evidência oficial para excluir frutos do mar sem liberar preparados incertos', () => {
    expect(inferOfficialAllergenEvidence({
      name: 'Camarão, Rio Grande, grande, cozido',
      normalized_name: 'camarao rio grande grande cozido',
      food_group: 'Pescados e frutos do mar',
      source_type: 'official',
    }).contains_shellfish).toBe('true');

    expect(inferOfficialAllergenEvidence({
      name: 'Arroz, tipo 1, cozido',
      normalized_name: 'arroz tipo 1 cozido',
      food_group: 'Cereais e derivados',
      source_type: 'official',
    }).contains_shellfish).toBe('false');

    expect(inferOfficialAllergenEvidence({
      name: 'Preparação mista',
      normalized_name: 'preparacao mista',
      food_group: 'Alimentos preparados',
      source_type: 'official',
    }).contains_shellfish).toBeUndefined();
  });

  it('aceita claims JWT atuais somente nas pontes server-only dos RPCs', () => {
    const sql = fs.readFileSync(
      path.resolve(__dirname, '../supabase/migrations/20260910000023_current_jwt_claims_rpc_bridge.sql'),
      'utf8'
    );
    expect(sql).toContain("current_setting('request.jwt.claims', true)");
    expect(sql).toContain('persist_diet_plan_from_service');
    expect(sql).toContain('persist_workout_program_from_service');
    expect(sql).toContain('FROM PUBLIC, anon, authenticated');
    expect(sql).toContain('TO service_role');
  });

  it('substitui o papel provisório other pela função nutricional inferida', () => {
    const food = {
      id: 'official-chicken',
      name: 'Frango, peito, grelhado',
      normalized_name: 'frango peito grelhado',
      food_group: 'Carnes e derivados',
      source_type: 'official',
      validation_status: 'official_approved',
      energy_kcal_100g: 159,
      protein_g_100g: 32,
      carbohydrate_g_100g: 0,
      fat_g_100g: 2.5,
      fiber_g_100g: null,
      sodium_mg_100g: 50,
      role: 'other',
      tags: { contains_shellfish: 'false' },
    } as unknown as ComposerCandidateFood;
    const constraints = {
      allowed_dietary_pattern: 'omnivore',
      favorite_foods: [], disliked_foods: [], foods_patient_refuses: [],
      preferred_protein_sources: [], preferred_carbohydrate_sources: [], preferred_fat_sources: [],
      preferred_fruits: [], preferred_vegetables: [], cuisine_preferences: [],
      religious_or_cultural_restrictions: [], patient_reported_allergies: ['frutos do mar'],
      patient_reported_intolerances: [], patient_reported_clinical_restrictions: [],
    } as unknown as NutritionConstraints;
    expect(filterEligibleFoods([food], constraints).eligibleFoods[0]?.role).toBe('protein');
  });

  it('não confunde grupos TACO terminados em derivados com laticínios', () => {
    const food = (food_group: string, macros: [number, number, number, number]) => ({
      food_group,
      energy_kcal_100g: macros[0],
      protein_g_100g: macros[1],
      carbohydrate_g_100g: macros[2],
      fat_g_100g: macros[3],
    });

    expect(inferFoodRole(food('Cereais e derivados', [130, 2.5, 28, 0.3]))).toBe('carb');
    expect(inferFoodRole(food('Leguminosas e derivados', [76, 4.8, 13.6, 0.5]))).toBe('legume');
    expect(inferFoodRole(food('Verduras, hortaliças e derivados', [25, 2, 4, 0.2]))).toBe('vegetable');
    expect(inferFoodRole(food('Frutas e derivados', [52, 0.3, 13.8, 0.2]))).toBe('fruit');
    expect(inferFoodRole(food('Leite e derivados', [61, 3.2, 4.7, 3.3]))).toBe('dairy');
  });

  it('converte os códigos curados de exercício em UUIDs determinísticos persistíveis', () => {
    const exercise = CURATED_EXERCISE_CATALOG[0];
    const uuid = exerciseCodeToUuid(exercise.code);
    expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(exerciseCodeToUuid(exercise.code)).toBe(uuid);
    expect(toPersistedExercise(exercise)).toMatchObject({ id: uuid, code: exercise.code });
  });
});
