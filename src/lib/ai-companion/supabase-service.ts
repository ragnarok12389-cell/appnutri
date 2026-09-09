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
import { applySubstitutionAction } from '@/app/actions/diet-plan';
import { runProgressAnalysisForPatient } from '@/lib/progress-engine/service';

export class SupabaseContextDataSource implements ContextDataSource {
  private supabase = createAdminClient();

  public async getProfile(patientId: string): Promise<ProfileContextPack> {
    const { data: profile, error: profileError } = await this.supabase
      .from('profiles')
      .select('full_name')
      .eq('id', patientId)
      .single();

    if (profileError || !profile) {
      throw new Error(`Perfil do paciente não localizado: ${profileError?.message ?? 'registro ausente'}`);
    }

    const { data: nutProfile, error: nutritionProfileError } = await this.supabase
      .from('patient_nutrition_profiles')
      .select('primary_goal')
      .eq('id', patientId)
      .maybeSingle();

    if (nutritionProfileError) {
      throw new Error(`Falha ao carregar perfil nutricional: ${nutritionProfileError.message}`);
    }

    const { data: sensitive, error: sensitiveError } = await this.supabase
      .from('patient_nutrition_sensitive')
      .select('food_allergies, clinical_dietary_restrictions')
      .eq('patient_id', patientId)
      .maybeSingle();

    if (sensitiveError) {
      throw new Error(`Falha ao carregar restrições clínicas: ${sensitiveError.message}`);
    }

    return {
      patient_id: patientId,
      full_name: profile.full_name ?? 'Paciente',
      objective: nutProfile?.primary_goal ?? 'Manutenção da saúde e composição corporal',
      allergies: sensitive?.food_allergies ?? [],
      dietary_restrictions: sensitive?.clinical_dietary_restrictions ?? [],
      movement_contraindications: [],
      movement_constraints_available: false,
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
    const [logsResult, analysisResult, proposalsResult] = await Promise.all([
      this.supabase.from('workout_execution_logs').select('session_date').eq('patient_id', patientId)
        .order('session_date', { ascending: false }).limit(10),
      this.supabase.from('progress_analyses').select('data_quality, metrics').eq('patient_id', patientId)
        .order('created_at', { ascending: false }).limit(1).maybeSingle(),
      this.supabase.from('adjustment_proposals').select('id', { count: 'exact', head: true })
        .eq('patient_id', patientId).eq('status', 'pending_review'),
    ]);

    if (logsResult.error || analysisResult.error || proposalsResult.error) {
      throw new Error('Resumo autoritativo de progresso indisponível.');
    }

    const dates = new Set((logsResult.data ?? []).map((log) => log.session_date));
    const metrics = (analysisResult.data?.metrics ?? {}) as Record<string, number | null>;

    return {
      recent_sessions_completed: Number(metrics.workouts_completed ?? dates.size),
      last_logged_session_date: logsResult.data?.[0]?.session_date,
      data_quality: analysisResult.data?.data_quality,
      check_in_count: Number(metrics.check_in_count ?? 0),
      weight_change_kg: metrics.weight_change_kg ?? null,
      average_hunger: metrics.average_hunger ?? null,
      average_energy: metrics.average_energy ?? null,
      average_nutrition_adherence: metrics.average_nutrition_adherence ?? null,
      average_workout_adherence: metrics.average_workout_adherence ?? null,
      pending_review_count: proposalsResult.count ?? 0,
    };
  }

  public async getConversationHistory(
    patientId: string,
    conversationId?: string
  ): Promise<ConversationContextPack> {
    if (!conversationId) {
      return { recent_messages: [] };
    }

    const { data: conv, error: conversationError } = await this.supabase
      .from('ai_conversations')
      .select('context_summary')
      .eq('id', conversationId)
      .eq('patient_id', patientId)
      .maybeSingle();

    if (conversationError || !conv) {
      throw new Error('Conversa não pertence ao paciente autenticado.');
    }

    const { data: msgs, error: messagesError } = await this.supabase
      .from('ai_messages')
      .select('role, content')
      .eq('conversation_id', conversationId)
      .eq('patient_id', patientId)
      .order('created_at', { ascending: true })
      .limit(10);

    if (messagesError) {
      throw new Error(`Falha ao carregar histórico da conversa: ${messagesError.message}`);
    }

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
    const { data, error } = await this.supabase
      .from('nutrition_targets')
      .select('constraints_data')
      .eq('patient_id', patientId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data?.constraints_data) {
      throw new Error(`Restrições nutricionais versionadas não disponíveis: ${error?.message ?? 'snapshot ausente'}`);
    }

    return data.constraints_data as NutritionConstraints;
  }

  public async getFoodItem(
    patientId: string,
    mealId: string,
    foodId: string
  ): Promise<(DietMealItemSnapshot & { item_id: string; plan_id: string; meal_id: string }) | null> {
    const { data: plan, error: planError } = await this.supabase
      .from('diet_plans')
      .select('id')
      .eq('patient_id', patientId)
      .eq('is_active', true)
      .eq('approval_status', 'approved')
      .maybeSingle();

    if (planError) throw new Error(`Falha ao validar plano ativo: ${planError.message}`);
    if (!plan) return null;

    const { data: days, error: daysError } = await this.supabase
      .from('diet_plan_days')
      .select('id')
      .eq('diet_plan_id', plan.id);
    if (daysError) throw new Error(`Falha ao validar dias do plano: ${daysError.message}`);

    const dayIds = (days ?? []).map((day) => day.id);
    if (dayIds.length === 0) return null;

    const { data: meal, error: mealError } = await this.supabase
      .from('diet_meals')
      .select('id')
      .eq('id', mealId)
      .in('diet_plan_day_id', dayIds)
      .maybeSingle();
    if (mealError) throw new Error(`Falha ao validar refeição do plano: ${mealError.message}`);
    if (!meal) return null;

    const { data: item, error: itemError } = await this.supabase
      .from('diet_meal_items')
      .select('*')
      .eq('diet_meal_id', mealId)
      .eq('food_id', foodId)
      .maybeSingle();

    if (itemError) throw new Error(`Falha ao validar item da refeição: ${itemError.message}`);
    if (!item) return null;

    return {
      item_id: item.id,
      plan_id: plan.id,
      meal_id: meal.id,
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
    const { data, error } = await this.supabase
      .from('foods')
      .select(`
        id, source_food_code, name, normalized_name, food_group, source_type,
        preparation_state, food_data_sources ( version ),
        food_nutrients ( amount_per_100g, nutrients ( code ) ),
        food_household_measures ( label, grams ),
        food_tag_mappings ( value, food_tags ( code ) )
      `)
      .eq('is_active', true)
      .eq('engine_eligibility_status', 'eligible_for_engine');

    if (error || !data) {
      throw new Error(`Catálogo canônico de alimentos indisponível: ${error?.message ?? 'sem dados'}`);
    }

    return (data as unknown as Array<{
      id: string;
      source_food_code: string;
      name: string;
      normalized_name: string;
      food_group: string;
      source_type: string;
      preparation_state: string;
      food_data_sources: { version: string } | null;
      food_nutrients: Array<{ amount_per_100g: number | null; nutrients: { code: string } | null }>;
      food_household_measures: Array<{ label: string; grams: number }>;
      food_tag_mappings: Array<{ value: 'true' | 'false' | 'unknown'; food_tags: { code: string } | null }>;
    }>).map((food) => {
      const nutrients: Record<string, number> = {};
      for (const entry of food.food_nutrients ?? []) {
        if (entry.nutrients?.code && entry.amount_per_100g !== null) {
          nutrients[entry.nutrients.code] = Number(entry.amount_per_100g);
        }
      }
      const tags: Record<string, 'true' | 'false' | 'unknown'> = {};
      for (const entry of food.food_tag_mappings ?? []) {
        if (entry.food_tags?.code) tags[entry.food_tags.code] = entry.value;
      }
      const measure = food.food_household_measures?.[0];
      return {
        id: food.id,
        name: food.name,
        normalized_name: food.normalized_name,
        source_food_code: food.source_food_code,
        food_group: food.food_group,
        source_type: food.source_type,
        source_version: food.food_data_sources?.version ?? 'unknown',
        preparation_state: food.preparation_state,
        role: 'other',
        price_per_100g: null,
        price_confidence: 0,
        price_source_level: 'unknown',
        energy_kcal_100g: nutrients.energy_kcal ?? 0,
        protein_g_100g: nutrients.protein ?? 0,
        carbohydrate_g_100g: nutrients.carbohydrate ?? 0,
        fat_g_100g: nutrients.lipids ?? 0,
        fiber_g_100g: nutrients.dietary_fiber ?? null,
        sodium_mg_100g: nutrients.sodium ?? null,
        household_measure: measure ? { label: measure.label, grams: Number(measure.grams) } : null,
        tags,
      } satisfies ComposerCandidateFood;
    });
  }

  public async getWorkoutConstraints(): Promise<WorkoutConstraints | null> {
    // A Etapa 7 persiste somente o hash do input, não o snapshot das restrições.
    // Sem evidência verificável, o Companion deve falhar fechado.
    return null;
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

    try {
      await runProgressAnalysisForPatient(event.patient_id);
    } catch {
      // O evento permanece em status recorded para reprocessamento no próximo check-in.
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
    const { error } = await this.supabase.from('ai_tool_executions').insert({
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

    if (error) {
      throw new Error(`Falha ao criar confirmação pendente: ${error.message}`);
    }
  }

  public async getPendingAction(token: string, patientId: string): Promise<{
    patient_id: string;
    action_type: string;
    payload: Record<string, unknown>;
    expires_at: Date;
    is_consumed: boolean;
    error?: string;
  } | null> {
    const { data, error } = await this.supabase.rpc('claim_ai_pending_action', {
      p_confirmation_token: token,
      p_patient_id: patientId,
    });

    if (error) {
      throw new Error(`Falha ao reivindicar confirmação: ${error.message}`);
    }

    const result = data as {
      ok?: boolean;
      error?: string;
      patient_id?: string;
      payload?: Record<string, unknown>;
      expires_at?: string;
    } | null;

    if (!result) return null;
    if (!result.ok) {
      return {
        patient_id: patientId,
        action_type: 'food_substitution',
        payload: {},
        expires_at: new Date(0),
        is_consumed: true,
        error: result.error ?? 'INVALID_CONFIRMATION_TOKEN',
      };
    }

    return {
      patient_id: result.patient_id ?? patientId,
      action_type: 'food_substitution',
      payload: result.payload ?? {},
      expires_at: new Date(result.expires_at ?? Date.now() + 60_000),
      is_consumed: false,
    };
  }

  public async completePendingAction(
    token: string,
    patientId: string,
    success: boolean,
    output?: Record<string, unknown>,
    errorMessage?: string
  ): Promise<void> {
    const { data, error } = await this.supabase.rpc('finalize_ai_pending_action', {
      p_confirmation_token: token,
      p_patient_id: patientId,
      p_success: success,
      p_output: output ?? null,
      p_error_message: errorMessage ?? null,
    });

    if (error || data !== true) {
      throw new Error(`Falha ao finalizar confirmação: ${error?.message ?? 'ação não estava em processamento'}`);
    }
  }

  public async applyDietSubstitution(params: {
    patient_id: string;
    plan_id: string;
    item_id: string;
    meal_id: string;
    current_food_id: string;
    replacement_food_id: string;
    suggested_grams: number;
  }): Promise<{ success: boolean; new_plan_id: string }> {
    const result = await applySubstitutionAction(
      params.plan_id,
      params.item_id,
      params.replacement_food_id,
      params.suggested_grams
    );

    if (!result.success || !result.data) {
      throw new Error(result.error ?? 'Falha ao criar versão substituta do plano alimentar.');
    }

    return { success: true, new_plan_id: result.data.newPlanId };
  }
}
