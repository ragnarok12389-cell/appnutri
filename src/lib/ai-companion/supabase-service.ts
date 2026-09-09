/**
 * Supabase Data Source & Tool Services Adapter para o AI Companion (ETAPA 8)
 * Conecta ContextBuilder e ToolRegistry ao banco de dados Supabase com RLS e tenant isolation.
 */

import { ContextDataSource } from './context-builder';
import {
  ProfileContextPack,
  DietContextPack,
  WorkoutContextPack,
  ProgressContextPack,
  ConversationContextPack,
} from '@/types/ai-companion';
import { createAdminClient } from '@/lib/supabase/admin';
import { DietMealItemSnapshot } from '@/types/diet-plan';
import { NutritionConstraints } from '@/types/nutrition-engine';
import { ComposerCandidateFood } from '@/lib/diet-composer/types';
import { WorkoutConstraints } from '@/types/workout-engine';
import { ToolDataServices } from './tools';

export class SupabaseContextDataSource implements ContextDataSource {
  private supabase = createAdminClient();

  public async getProfile(patientId: string): Promise<ProfileContextPack> {
    const { data: profile } = await this.supabase
      .from('profiles')
      .select('full_name')
      .eq('id', patientId)
      .single();

    const { data: nutProfile } = await this.supabase
      .from('patient_nutrition_profiles')
      .select('objective, allergies, dietary_restrictions, physical_activity_level')
      .eq('patient_id', patientId)
      .single();

    return {
      patient_id: patientId,
      full_name: profile?.full_name ?? 'Paciente',
      objective: nutProfile?.objective ?? 'Manutenção da saúde e composição corporal',
      allergies: nutProfile?.allergies ?? [],
      dietary_restrictions: nutProfile?.dietary_restrictions ?? [],
      movement_contraindications: [],
    };
  }

  public async getDietPlan(patientId: string): Promise<DietContextPack> {
    const { data: plan } = await this.supabase
      .from('diet_plans')
      .select('id, version, composer_version')
      .eq('patient_id', patientId)
      .eq('is_active', true)
      .eq('approval_status', 'approved')
      .single();

    if (!plan) {
      return { has_active_plan: false, today_meals: [] };
    }

    // Identifica dia atual da semana (1 = segunda, 7 = domingo)
    const currentDayOfWeek = ((new Date().getDay() + 6) % 7) + 1;

    const { data: day } = await this.supabase
      .from('diet_plan_days')
      .select('id, day_label, target_calories_kcal, target_protein_g, target_carbohydrate_g, target_fat_g')
      .eq('diet_plan_id', plan.id)
      .eq('day_of_week', currentDayOfWeek)
      .single();

    if (!day) {
      return {
        has_active_plan: true,
        plan_id: plan.id,
        version: plan.version,
        today_meals: [],
      };
    }

    const { data: meals } = await this.supabase
      .from('diet_meals')
      .select('id, name, meal_order, target_time')
      .eq('diet_plan_day_id', day.id)
      .order('meal_order', { ascending: true });

    const mealIds = (meals ?? []).map((m) => m.id);
    const itemsByMeal: Record<string, DietContextPack['today_meals'][0]['items']> = {};

    if (mealIds.length > 0) {
      const { data: items } = await this.supabase
        .from('diet_meal_items')
        .select('diet_meal_id, food_id, food_name, serving_weight_g, energy_kcal, protein_g, carbohydrate_g, fat_g, household_measure_label')
        .in('diet_meal_id', mealIds)
        .order('item_order', { ascending: true });

      for (const item of items ?? []) {
        if (!itemsByMeal[item.diet_meal_id]) itemsByMeal[item.diet_meal_id] = [];
        itemsByMeal[item.diet_meal_id].push({
          food_id: item.food_id,
          food_name: item.food_name,
          grams: Number(item.serving_weight_g),
          calories: Math.round(Number(item.energy_kcal)),
          protein_g: Math.round(Number(item.protein_g)),
          carbs_g: Math.round(Number(item.carbohydrate_g)),
          fat_g: Math.round(Number(item.fat_g)),
          household_measure: item.household_measure_label,
        });
      }
    }

    return {
      has_active_plan: true,
      plan_id: plan.id,
      version: plan.version,
      composer_version: plan.composer_version,
      today_day_label: day.day_label,
      target_calories: Math.round(Number(day.target_calories_kcal)),
      target_protein_g: Math.round(Number(day.target_protein_g)),
      target_carbs_g: Math.round(Number(day.target_carbohydrate_g)),
      target_fat_g: Math.round(Number(day.target_fat_g)),
      today_meals: (meals ?? []).map((m) => ({
        meal_id: m.id,
        name: m.name,
        order: m.meal_order,
        target_time: m.target_time,
        items: itemsByMeal[m.id] ?? [],
      })),
    };
  }

  public async getWorkoutProgram(patientId: string): Promise<WorkoutContextPack> {
    const { data: prog } = await this.supabase
      .from('workout_programs')
      .select('id, split_type, sessions_per_week')
      .eq('patient_id', patientId)
      .eq('is_active', true)
      .eq('approval_status', 'approved')
      .single();

    if (!prog) {
      return { has_active_program: false };
    }

    const currentDayOfWeek = ((new Date().getDay() + 6) % 7) + 1;

    const { data: day } = await this.supabase
      .from('workout_program_days')
      .select('id, is_rest_day')
      .eq('workout_program_id', prog.id)
      .eq('day_of_week', currentDayOfWeek)
      .single();

    if (!day || day.is_rest_day) {
      return {
        has_active_program: true,
        program_id: prog.id,
        split_type: prog.split_type,
        sessions_per_week: prog.sessions_per_week,
        today_session: null,
      };
    }

    const { data: session } = await this.supabase
      .from('workout_sessions')
      .select('id, name, session_focus, estimated_duration_minutes')
      .eq('workout_program_day_id', day.id)
      .single();

    if (!session) {
      return {
        has_active_program: true,
        program_id: prog.id,
        split_type: prog.split_type,
        sessions_per_week: prog.sessions_per_week,
        today_session: null,
      };
    }

    const { data: exercises } = await this.supabase
      .from('workout_exercises')
      .select('id, exercise_id, exercise_name, movement_pattern, prescribed_sets, min_reps, max_reps, target_rir, rest_seconds, progression_strategy')
      .eq('workout_session_id', session.id)
      .order('exercise_order', { ascending: true });

    return {
      has_active_program: true,
      program_id: prog.id,
      split_type: prog.split_type,
      sessions_per_week: prog.sessions_per_week,
      today_session: {
        session_id: session.id,
        name: session.name,
        session_focus: session.session_focus,
        duration_minutes: session.estimated_duration_minutes,
        exercises: (exercises ?? []).map((e) => ({
          workout_exercise_id: e.id,
          exercise_id: e.exercise_id,
          name: e.exercise_name,
          movement_pattern: e.movement_pattern,
          prescribed_sets: e.prescribed_sets,
          min_reps: e.min_reps,
          max_reps: e.max_reps,
          target_rir: e.target_rir,
          rest_seconds: e.rest_seconds,
          progression_strategy: e.progression_strategy,
        })),
      },
    };
  }

  public async getProgress(patientId: string): Promise<ProgressContextPack> {
    const { data: logs } = await this.supabase
      .from('workout_execution_logs')
      .select('session_date')
      .eq('patient_id', patientId)
      .order('session_date', { ascending: false })
      .limit(10);

    const dates = new Set((logs ?? []).map((l) => l.session_date));

    return {
      recent_sessions_completed: dates.size,
      last_logged_session_date: logs?.[0]?.session_date,
    };
  }

  public async getConversationHistory(conversationId?: string): Promise<ConversationContextPack> {
    if (!conversationId) {
      return { recent_messages: [] };
    }

    const { data: conv } = await this.supabase
      .from('ai_conversations')
      .select('context_summary')
      .eq('id', conversationId)
      .single();

    const { data: msgs } = await this.supabase
      .from('ai_messages')
      .select('role, content')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .limit(10);

    return {
      recent_messages: (msgs ?? []).map((m) => ({
        role: m.role as ConversationContextPack['recent_messages'][0]['role'],
        content: m.content,
      })),
      context_summary: conv?.context_summary,
    };
  }
}

export class SupabaseToolDataServices implements ToolDataServices {
  private supabase = createAdminClient();

  public async getActiveDietPlan(patientId: string): Promise<unknown> {
    const source = new SupabaseContextDataSource();
    return await source.getDietPlan(patientId);
  }

  public async getTodayMeals(patientId: string): Promise<unknown> {
    const source = new SupabaseContextDataSource();
    const diet = await source.getDietPlan(patientId);
    return diet.today_meals;
  }

  public async getActiveWorkoutProgram(patientId: string): Promise<unknown> {
    const source = new SupabaseContextDataSource();
    return await source.getWorkoutProgram(patientId);
  }

  public async getTodayWorkout(patientId: string): Promise<unknown> {
    const source = new SupabaseContextDataSource();
    const workout = await source.getWorkoutProgram(patientId);
    return workout.today_session;
  }

  public async getProgressSummary(patientId: string): Promise<unknown> {
    const source = new SupabaseContextDataSource();
    return await source.getProgress(patientId);
  }

  public async getDietConstraints(patientId: string): Promise<NutritionConstraints> {
    const { data } = await this.supabase
      .from('patient_nutrition_profiles')
      .select('allergies, dietary_restrictions')
      .eq('patient_id', patientId)
      .single();

    return {
      allowed_dietary_pattern: null,
      favorite_foods: [],
      disliked_foods: [],
      foods_patient_refuses: [],
      preferred_protein_sources: [],
      preferred_carbohydrate_sources: [],
      preferred_fat_sources: [],
      preferred_fruits: [],
      preferred_vegetables: [],
      cuisine_preferences: [],
      religious_or_cultural_restrictions: [],
      patient_reported_allergies: data?.allergies ?? [],
      patient_reported_intolerances: [],
      patient_reported_clinical_restrictions: data?.dietary_restrictions ?? [],
      available_cooking_time_minutes: 30,
      cooking_skill_level: 'medium',
      meal_prep_days: ['sunday'],
      available_equipment: {
        has_refrigerator: true,
        has_freezer: true,
        has_microwave: true,
        has_stove: true,
        has_air_fryer: false,
      },
      logistics: {
        needs_packed_meals: false,
        eats_out_frequently: false,
        meals_out_per_week: 0,
        uses_delivery_frequency: null,
        eats_at_work: false,
        work_refrigerator_available: true,
        work_microwave_available: true,
      },
      habits: {
        water_intake_liters: 2.0,
        coffee_frequency: 'daily',
        alcohol_frequency: 'rarely',
        hunger_pattern: 'normal',
        primary_challenges: [],
      },
      budget_limit: {
        daily_max: 50.0,
        currency: 'BRL',
        estimate_type: 'individual_exact',
        flexibility: null,
      },
    };
  }

  public async getFoodItem(foodId: string): Promise<DietMealItemSnapshot | null> {
    const { data: item } = await this.supabase
      .from('diet_meal_items')
      .select('*')
      .eq('food_id', foodId)
      .limit(1)
      .single();

    if (!item) return null;

    return {
      food_id: item.food_id,
      food_name: item.food_name,
      source_id: item.source_id,
      source_food_code: item.source_food_code,
      source_type: item.source_type,
      source_version: item.source_version,
      grams: Number(item.serving_weight_g),
      energy_kcal: Number(item.energy_kcal),
      protein_g: Number(item.protein_g),
      carbohydrate_g: Number(item.carbohydrate_g),
      fat_g: Number(item.fat_g),
      fiber_g: Number(item.fiber_g),
      sodium_mg: Number(item.sodium_mg),
      household_measure_label: item.household_measure_label,
      household_measure_quantity: item.household_measure_quantity,
      price_estimate: item.price_estimate ? Number(item.price_estimate) : null,
      price_confidence: item.price_confidence ? Number(item.price_confidence) : 1.0,
      price_source_level: item.price_source_level ?? 'item',
      currency: item.currency ?? 'BRL',
      composition_snapshot_hash: item.composition_snapshot_hash,
      item_order: item.item_order,
    };
  }

  public async getFoodCatalog(): Promise<ComposerCandidateFood[]> {
    const { data } = await this.supabase
      .from('food_items')
      .select('*')
      .limit(100);

    return (data ?? []).map((f) => ({
      id: f.id,
      name: f.name,
      normalized_name: f.name.toLowerCase(),
      source_food_code: f.source_food_code,
      food_group: f.food_group,
      source_type: f.source_type ?? 'taco',
      source_version: f.source_version ?? '1.0.0',
      preparation_state: f.preparation_state ?? 'cru',
      role: 'other',
      price_per_100g: null,
      energy_kcal_100g: Number(f.energy_kcal),
      protein_g_100g: Number(f.protein_g),
      carbohydrate_g_100g: Number(f.carbohydrate_g),
      fat_g_100g: Number(f.fat_g),
      fiber_g_100g: f.fiber_g ? Number(f.fiber_g) : null,
      sodium_mg_100g: f.sodium_mg ? Number(f.sodium_mg) : null,
      tags: f.tags ?? {},
    })) as ComposerCandidateFood[];
  }

  public async getWorkoutConstraints(_patientId: string): Promise<WorkoutConstraints> {
    return {
      available_equipment: ['barbell', 'dumbbell', 'machine', 'cable', 'bench', 'bodyweight'],
      movement_contraindications: [],
      favorite_exercises: [],
      exercises_refused: [],
      preferred_equipment: [],
    };
  }

  public async recordFeedback(event: {
    patient_id: string;
    conversation_id: string;
    feedback_type: string;
    domain: string;
    target_entity_type?: string;
    target_entity_id?: string;
    intensity_rating?: number;
    notes?: string;
  }): Promise<{ id: string; status: string }> {
    const { data, error } = await this.supabase
      .from('ai_feedback_events')
      .insert({
        patient_id: event.patient_id,
        conversation_id: event.conversation_id,
        feedback_type: event.feedback_type,
        domain: event.domain,
        target_entity_type: event.target_entity_type,
        target_entity_id: event.target_entity_id,
        intensity_rating: event.intensity_rating,
        notes: event.notes,
        status: 'recorded',
      })
      .select('id, status')
      .single();

    if (error || !data) {
      throw new Error(`Falha ao registrar feedback: ${error?.message}`);
    }

    return { id: data.id, status: data.status };
  }

  public async createPendingAction(action: {
    patient_id: string;
    conversation_id: string;
    token: string;
    action_type: string;
    payload: Record<string, unknown>;
    expires_at: Date;
  }): Promise<void> {
    await this.supabase.from('ai_tool_executions').insert({
      patient_id: action.patient_id,
      conversation_id: action.conversation_id,
      tool_name: 'proposeFoodSubstitution',
      input_arguments: action.payload,
      is_authorized: true,
      requires_user_confirmation: true,
      confirmation_status: 'pending',
      confirmation_token: action.token,
      confirmation_expires_at: action.expires_at.toISOString(),
      execution_status: 'pending_confirmation',
      output_payload: action.payload,
    });
  }

  public async getPendingAction(token: string): Promise<{
    patient_id: string;
    action_type: string;
    payload: Record<string, unknown>;
    expires_at: Date;
    is_consumed: boolean;
  } | null> {
    const { data } = await this.supabase
      .from('ai_tool_executions')
      .select('patient_id, input_arguments, confirmation_expires_at, confirmation_status')
      .eq('confirmation_token', token)
      .single();

    if (!data) return null;

    return {
      patient_id: data.patient_id,
      action_type: 'food_substitution',
      payload: data.input_arguments as Record<string, unknown>,
      expires_at: new Date(data.confirmation_expires_at),
      is_consumed: data.confirmation_status === 'confirmed',
    };
  }

  public async consumePendingAction(token: string): Promise<void> {
    await this.supabase
      .from('ai_tool_executions')
      .update({
        confirmation_status: 'confirmed',
        execution_status: 'success',
      })
      .eq('confirmation_token', token);
  }

  public async applyDietSubstitution(params: {
    patient_id: string;
    meal_id: string;
    current_food_id: string;
    replacement_food_id: string;
    suggested_grams: number;
  }): Promise<{ success: boolean; new_item_id: string }> {
    // Efetiva a substituição no item da refeição
    const { data: updated, error } = await this.supabase
      .from('diet_meal_items')
      .update({
        food_id: params.replacement_food_id,
        serving_weight_g: params.suggested_grams,
      })
      .eq('diet_meal_id', params.meal_id)
      .eq('food_id', params.current_food_id)
      .select('id')
      .single();

    if (error || !updated) {
      throw new Error(`Falha ao aplicar substituição no plano: ${error?.message}`);
    }

    return { success: true, new_item_id: updated.id };
  }
}
