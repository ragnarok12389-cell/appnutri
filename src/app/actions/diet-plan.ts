'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentUser } from '@/lib/auth/session';
import { hasPermission } from '@/lib/auth/roles';
import { logAuditEvent } from '@/lib/audit/logger';
import {
  ComposerCandidateFood,
  ComposerInput,
} from '@/lib/diet-composer/types';
import { runDietComposer } from '@/lib/diet-composer/engine';
import { getFoodSubstitutionOptions } from '@/lib/diet-composer/substitution';
import {
  computeCompositionSnapshotHash,
  computeOutputPlanHash,
} from '@/lib/diet-composer/hash';
import { checkAdherenceTolerances } from '@/lib/diet-composer/solver';
import { evaluatePlanPricing } from '@/lib/diet-composer/budget';
import { PRICE_ENGINE_VERSION } from '@/lib/foods/pricing-config';
import { DietMealItemSnapshot, DietMealType, DietPlan, FoodSubstitutionOption } from '@/types/diet-plan';
import { NutritionConstraints } from '@/types/nutrition-engine';
import { readCanonicalFoodNutrients } from '@/lib/diet-composer/catalog-mapping';
import { inferOfficialAllergenEvidence } from '@/lib/foods/official-allergen-evidence';

interface RawFoodNutrient {
  amount_per_100g: number | null;
  nutrients: { code: string } | null;
}

interface RawFoodTagMapping {
  value: 'true' | 'false' | 'unknown';
  food_tags: { code: string } | null;
}

interface RawHouseholdMeasure {
  label: string;
  grams: number;
}

interface RawFoodData {
  id: string;
  source_id?: string | null;
  source_food_code: string;
  name: string;
  normalized_name: string;
  food_group: string;
  source_type: string;
  validation_status?: string;
  preparation_state: string;
  food_data_sources: { version: string; checksum?: string } | null;
  food_nutrients: RawFoodNutrient[];
  food_tag_mappings: RawFoodTagMapping[];
  food_household_measures: RawHouseholdMeasure[];
}

interface RawPlanItem {
  item_order: number;
  [key: string]: unknown;
}

interface RawPlanMeal {
  meal_order: number;
  diet_meal_items?: RawPlanItem[];
  [key: string]: unknown;
}

interface RawPlanDay {
  day_of_week: number;
  diet_meals?: RawPlanMeal[];
  [key: string]: unknown;
}

export interface ActionResponse<T = unknown> {
  data?: T;
  error?: string;
  success?: boolean;
}

/**
 * Executa a composição determinística de plano alimentar para um paciente.
 * Obtém alvos e restrições exclusivamente a partir do banco de dados (o cliente NUNCA envia alvos brutos).
 */
export async function generateDietPlanAction(
  patientId: string,
  dayCount: number = 7
): Promise<ActionResponse<{ planId: string; generation_status: string; output_plan_hash: string }>> {
  const user = await getCurrentUser();
  if (!user) {
    return { error: 'Acesso não autorizado: autenticação requerida.' };
  }

  const supabase = await createClient();
  const adminClient = createAdminClient();

  // 1. Resolução Real de Paciente (não assume auth.uid() = patient_id)
  const { data: patientRow, error: patientErr } = await adminClient
    .from('patients')
    .select('id')
    .eq('id', patientId)
    .maybeSingle();

  if (patientErr || !patientRow) {
    return { error: 'Paciente não encontrado no sistema.' };
  }

  const isPatientOwner = user.id === patientRow.id;
  const canGenerate = hasPermission(user, 'diet_plan.generate') || isPatientOwner;
  if (!canGenerate) {
    return { error: 'Acesso negado: você não possui autorização para gerar planos alimentares para este paciente.' };
  }

  // 2. Busca a execução mais recente do motor nutricional (NutritionEngineRun)
  const { data: latestRun, error: runError } = await supabase
    .from('nutrition_engine_runs')
    .select('*')
    .eq('patient_id', patientId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (runError || !latestRun) {
    return { error: 'Nenhum cálculo nutricional (NutritionEngineRun) encontrado para este paciente.' };
  }

  // 3. SAFETY GATE RÍGIDO ANTES DA COMPOSIÇÃO
  if (latestRun.status === 'insufficient_data') {
    return { error: 'Geração bloqueada: dados antropométricos ou nutricionais do paciente são insuficientes.' };
  }
  if (latestRun.status === 'blocked') {
    return { error: 'Geração bloqueada: caso com restrição clínica severa ou risco de saúde ativo.' };
  }

  const requiresReview =
    latestRun.status === 'review_required' || latestRun.requires_professional_review === true;

  // 4. Busca os alvos nutricionais (NutritionTarget) gerados na Etapa 4
  const { data: targetRow, error: targetError } = await supabase
    .from('nutrition_targets')
    .select('*')
    .eq('engine_run_id', latestRun.id)
    .limit(1)
    .maybeSingle();

  if (targetError || !targetRow) {
    return { error: 'Nenhum alvo nutricional (NutritionTarget) associado ao cálculo foi localizado.' };
  }

  // 5. Busca o snapshot do perfil nutricional para carregar as restrições (NutritionConstraints)
  const { data: snapshotRow } = await supabase
    .from('patient_nutrition_snapshots')
    .select('snapshot_data')
    .eq('id', latestRun.nutrition_snapshot_id)
    .limit(1)
    .maybeSingle();

  const constraints: NutritionConstraints = targetRow.constraints_data || snapshotRow?.snapshot_data?.constraints || {
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
    patient_reported_allergies: [],
    patient_reported_intolerances: [],
    patient_reported_clinical_restrictions: [],
    available_cooking_time_minutes: null,
    cooking_skill_level: null,
    meal_prep_days: [],
    available_equipment: { has_refrigerator: true, has_freezer: true, has_microwave: true, has_stove: true, has_air_fryer: false },
    logistics: { needs_packed_meals: false, eats_out_frequently: false, meals_out_per_week: null, uses_delivery_frequency: null, eats_at_work: false, work_refrigerator_available: false, work_microwave_available: false },
    habits: { water_intake_liters: 2, coffee_frequency: null, alcohol_frequency: null, hunger_pattern: null, primary_challenges: [] },
    budget_limit: { daily_max: targetRow.normalized_daily_budget || 0, currency: targetRow.currency || 'BRL', estimate_type: 'individual_exact', flexibility: null },
  };

  // 6. Busca os alimentos oficiais ativos no banco de dados com seus nutrientes e medidas
  const { data: foodsData, error: foodsError } = await adminClient
    .from('foods')
    .select(`
      id,
      source_id,
      source_food_code,
      name,
      normalized_name,
      food_group,
      source_type,
      validation_status,
      preparation_state,
      is_active,
      engine_eligibility_status,
      food_data_sources ( version, checksum ),
      food_nutrients (
        nutrient_id,
        amount_per_100g,
        nutrients ( code )
      ),
      food_household_measures ( label, grams ),
      food_tag_mappings (
        value,
        food_tags ( code )
      )
    `)
    .eq('is_active', true)
    .eq('engine_eligibility_status', 'eligible_for_engine');

  if (foodsError || !foodsData || foodsData.length === 0) {
    return { error: 'Catálogo de alimentos não encontrado no banco de dados.' };
  }

  // 7. Busca observações de preço
  const { data: priceObsData } = await adminClient
    .from('food_price_observations')
    .select('*')
    .order('observed_at', { ascending: false });

  const priceObservations = priceObsData || [];

  // 8. Normaliza os alimentos para a estrutura do Composer
  const candidateFoods: ComposerCandidateFood[] = [];
  let sourceVersion = '4a_edicao_2011';
  let sourceChecksum = 'canonical_taco_2011';

  for (const f of (foodsData || []) as unknown as RawFoodData[]) {
    // Política v1 para professional_custom: apenas TACO oficial ou custom com validação clínica apropriada
    const isOfficial =
      f.source_type === 'official' ||
      f.source_type === 'official_table' ||
      f.validation_status === 'official_approved';
    const isVerifiedCustom =
      (f.source_type === 'professional_custom' || f.source_type === 'custom') &&
      f.validation_status === 'verified_by_nutritionist';

    if (!isOfficial && !isVerifiedCustom) {
      continue;
    }

    if (f.food_data_sources?.version) {
      sourceVersion = f.food_data_sources.version;
    }
    if (f.food_data_sources?.checksum) {
      sourceChecksum = f.food_data_sources.checksum;
    }

    const nutrients = readCanonicalFoodNutrients(f.food_nutrients || []);

    const tagsMap: Record<string, 'true' | 'false' | 'unknown'> = {};
    for (const ft of f.food_tag_mappings || []) {
      const tagCode = ft.food_tags?.code;
      if (tagCode && ft.value) {
        tagsMap[tagCode] = ft.value;
      }
    }
    const effectiveTags = {
      ...inferOfficialAllergenEvidence(f),
      ...tagsMap,
    };

    const hm = f.food_household_measures?.[0];

    // Preço
    const obs = priceObservations.filter((p) => p.food_id === f.id);
    let pricePer100g: number | null = null;
    let priceConfidence = 0;
    let priceSourceLevel = 'unknown';

    if (obs.length > 0) {
      pricePer100g = Number(obs[0].price_per_100g);
      priceConfidence = Number(obs[0].confidence);
      priceSourceLevel = 'national';
    }

    candidateFoods.push({
      id: f.id,
      source_id: f.source_id || null,
      source_food_code: f.source_food_code,
      name: f.name,
      normalized_name: f.normalized_name,
      food_group: f.food_group,
      source_type: f.source_type,
      source_version: sourceVersion,
      validation_status: f.validation_status,
      preparation_state: f.preparation_state,
      ...nutrients,
      household_measure: hm ? { label: hm.label, grams: Number(hm.grams) } : null,
      tags: effectiveTags,
      role: 'other', // inferido no filtro
      price_per_100g: pricePer100g,
      price_confidence: priceConfidence,
      price_source_level: priceSourceLevel,
    });
  }

  // 9. Execução Determinística do Diet Composer com Timestamp Congelado
  const frozenReferenceAt = new Date().toISOString();
  const composerInput: ComposerInput = {
    patient_id: patientId,
    engine_run_id: latestRun.id,
    nutrition_target_id: targetRow.id,
    targets: targetRow,
    constraints: constraints,
    food_catalog: candidateFoods,
    food_dataset_version: sourceVersion,
    food_dataset_checksum: sourceChecksum,
    price_engine_version: PRICE_ENGINE_VERSION,
    generation_reference_at: frozenReferenceAt,
    price_observations: priceObservations,
    day_count: dayCount,
    requires_review: requiresReview,
  };

  const result = runDietComposer(composerInput);

  if (!result.success || !result.plan) {
    await logAuditEvent({
      actorId: user.id,
      action: 'diet_plan.infeasible',
      entityType: 'diet_plans',
      entityId: patientId,
      metadata: { reason_codes: result.infeasible_reason_codes, error: result.error_message },
    });

    return {
      error: `Não foi possível gerar o plano alimentar: ${result.error_message || 'Inviável'} (${result.infeasible_reason_codes.join(', ')})`,
    };
  }

  const generatedPlan = result.plan;

  // 10. Persistência Atômica no PostgreSQL via RPC em Transação Real (Lock de Concorrência e Superseding)
  const autoApprove = generatedPlan.approval_status === 'approved';
  const { data: savedPlanId, error: rpcError } = await adminClient.rpc('persist_diet_plan_from_service', {
    p_plan: {
      ...generatedPlan,
      created_by: user.id,
    },
    p_auto_approve: autoApprove,
  });

  if (rpcError || !savedPlanId) {
    return { error: `Erro na transação atômica de persistência do plano alimentar: ${rpcError?.message || 'Falha no RPC'}` };
  }

  const planId = savedPlanId as string;

  // 11. Auditoria
  await logAuditEvent({
    actorId: user.id,
    action: generatedPlan.generation_status === 'review_required' ? 'diet_plan.review_required' : 'diet_plan.generated',
    entityType: 'diet_plans',
    entityId: planId,
    metadata: {
      patient_id: patientId,
      output_plan_hash: generatedPlan.output_plan_hash,
      generation_status: generatedPlan.generation_status,
      day_count: generatedPlan.day_count,
    },
  });

  return {
    success: true,
    data: {
      planId,
      generation_status: generatedPlan.generation_status,
      output_plan_hash: generatedPlan.output_plan_hash,
    },
  };
}

/**
 * Retorna o plano alimentar ativo ou mais recente do paciente.
 */
export async function getLatestDietPlanAction(
  patientId: string
): Promise<ActionResponse<DietPlan | null>> {
  const user = await getCurrentUser();
  if (!user) {
    return { error: 'Acesso não autorizado: autenticação requerida.' };
  }

  const supabase = await createClient();

  // Busca o plano através de RLS seguro
  const { data: plan, error } = await supabase
    .from('diet_plans')
    .select(`
      *,
      diet_plan_days (
        *,
        diet_meals (
          *,
          diet_meal_items ( * )
        )
      )
    `)
    .eq('patient_id', patientId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return { error: error.message };
  }

  if (!plan) {
    return { data: null };
  }

  // Organizar dias e refeições por ordem numérica
  const sortedDays = ((plan.diet_plan_days || []) as unknown as RawPlanDay[])
    .sort((a, b) => a.day_of_week - b.day_of_week)
    .map((d) => ({
      ...d,
      meals: ((d.diet_meals || []) as RawPlanMeal[])
        .sort((m1, m2) => m1.meal_order - m2.meal_order)
        .map((m) => ({
          ...m,
          items: ((m.diet_meal_items || []) as RawPlanItem[]).sort((i1, i2) => i1.item_order - i2.item_order),
        })),
    }));

  return {
    data: {
      ...plan,
      days: sortedDays,
    },
  };
}

/**
 * Ação clínica de aprovação ou rejeição por Nutricionista.
 */
export async function reviewDietPlanAction(
  planId: string,
  decision: 'approved' | 'rejected',
  notes?: string
): Promise<ActionResponse<void>> {
  const user = await getCurrentUser();
  if (!user) {
    return { error: 'Acesso não autorizado: autenticação requerida.' };
  }

  if (!hasPermission(user, 'diet_plan.review')) {
    return { error: 'Acesso negado: apenas profissionais de nutrição podem revisar planos alimentares.' };
  }

  const supabase = await createClient();
  const adminClient = createAdminClient();

  const { data: plan, error: planError } = await supabase
    .from('diet_plans')
    .select('id, patient_id, approval_status')
    .eq('id', planId)
    .single();

  if (planError || !plan) {
    return { error: 'Plano alimentar não encontrado.' };
  }

  if (decision === 'approved') {
    // Desativa planos anteriores do paciente
    await adminClient
      .from('diet_plans')
      .update({ is_active: false })
      .eq('patient_id', plan.patient_id);

    // Ativa o plano aprovado
    await adminClient
      .from('diet_plans')
      .update({
        approval_status: 'approved',
        is_active: true,
        approved_by: user.id,
        approved_at: new Date().toISOString(),
      })
      .eq('id', planId);

    await logAuditEvent({
      actorId: user.id,
      action: 'diet_plan.approved',
      entityType: 'diet_plans',
      entityId: planId,
      metadata: { notes },
    });
  } else {
    await adminClient
      .from('diet_plans')
      .update({
        approval_status: 'rejected',
        is_active: false,
        rejection_reason: notes || 'Rejeitado na revisão clínica.',
      })
      .eq('id', planId);

    await logAuditEvent({
      actorId: user.id,
      action: 'diet_plan.rejected',
      entityType: 'diet_plans',
      entityId: planId,
      metadata: { notes },
    });
  }

  // Registra histórico na tabela de reviews
  await adminClient.from('diet_plan_reviews').insert({
    diet_plan_id: planId,
    reviewer_id: user.id,
    decision,
    review_notes: notes || null,
  });

  return { success: true };
}

/**
 * Retorna as opções da Troca Inteligente determinística para um item do plano.
 */
export async function getSubstitutionOptionsAction(
  planId: string,
  itemId: string
): Promise<ActionResponse<FoodSubstitutionOption[]>> {
  const user = await getCurrentUser();
  if (!user) {
    return { error: 'Acesso não autorizado: autenticação requerida.' };
  }

  const adminClient = createAdminClient();

  // 1. Busca o item específico do plano
  const { data: item, error: itemError } = await adminClient
    .from('diet_meal_items')
    .select('*')
    .eq('id', itemId)
    .single();

  if (itemError || !item) {
    return { error: 'Item do plano alimentar não encontrado.' };
  }

  // 2. Busca o plano e paciente
  const { data: plan } = await adminClient
    .from('diet_plans')
    .select('patient_id')
    .eq('id', planId)
    .single();

  if (!plan) {
    return { error: 'Plano alimentar não encontrado.' };
  }

  // 3. Busca as restrições do paciente
  const { data: targetRow } = await adminClient
    .from('nutrition_targets')
    .select('constraints_data')
    .eq('patient_id', plan.patient_id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const constraints: NutritionConstraints = targetRow?.constraints_data || {
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
    patient_reported_allergies: [],
    patient_reported_intolerances: [],
    patient_reported_clinical_restrictions: [],
    available_cooking_time_minutes: null,
    cooking_skill_level: null,
    meal_prep_days: [],
    available_equipment: { has_refrigerator: true, has_freezer: true, has_microwave: true, has_stove: true, has_air_fryer: false },
    logistics: { needs_packed_meals: false, eats_out_frequently: false, meals_out_per_week: null, uses_delivery_frequency: null, eats_at_work: false, work_refrigerator_available: false, work_microwave_available: false },
    habits: { water_intake_liters: 2, coffee_frequency: null, alcohol_frequency: null, hunger_pattern: null, primary_challenges: [] },
    budget_limit: { daily_max: 0, currency: 'BRL', estimate_type: 'individual_exact', flexibility: null },
  };

  // 4. Carrega alimentos elegíveis
  const { data: foodsData } = await adminClient
    .from('foods')
    .select(`
      id,
      name,
      normalized_name,
      food_group,
      source_type,
      food_nutrients (
        amount_per_100g,
        nutrients ( code )
      ),
      food_household_measures ( label, grams ),
      food_tag_mappings (
        value,
        food_tags ( code )
      )
    `)
    .eq('is_active', true)
    .eq('engine_eligibility_status', 'eligible_for_engine');

  const candidateFoods: ComposerCandidateFood[] = [];
  for (const f of ((foodsData || []) as unknown as RawFoodData[])) {
    const nutrientsMap: Record<string, number> = {};
    for (const fn of f.food_nutrients || []) {
      const code = fn.nutrients?.code;
      if (code && fn.amount_per_100g !== null) {
        nutrientsMap[code] = Number(fn.amount_per_100g);
      }
    }
    const tagsMap: Record<string, 'true' | 'false' | 'unknown'> = {};
    for (const ft of f.food_tag_mappings || []) {
      const tagCode = ft.food_tags?.code;
      if (tagCode && ft.value) {
        tagsMap[tagCode] = ft.value;
      }
    }
    const hm = f.food_household_measures?.[0];

    candidateFoods.push({
      id: f.id,
      source_food_code: '',
      name: f.name,
      normalized_name: f.normalized_name,
      food_group: f.food_group,
      source_type: f.source_type,
      source_version: '4.0.0',
      preparation_state: f.preparation_state,
      energy_kcal_100g: nutrientsMap['energy_kcal'] || 0,
      protein_g_100g: nutrientsMap['protein'] || 0,
      carbohydrate_g_100g: nutrientsMap['carbohydrate'] || 0,
      fat_g_100g: nutrientsMap['lipids'] || 0,
      fiber_g_100g: nutrientsMap['fiber'] || null,
      sodium_mg_100g: nutrientsMap['sodium'] || null,
      household_measure: hm ? { label: hm.label, grams: Number(hm.grams) } : null,
      tags: tagsMap,
      role: 'other',
      price_per_100g: null,
      price_confidence: 0,
      price_source_level: 'unknown',
    });
  }

  // 5. Executa a Troca Inteligente
  const options = getFoodSubstitutionOptions(item, constraints, candidateFoods);

  await logAuditEvent({
    actorId: user.id,
    action: 'diet_plan.substitution_requested',
    entityType: 'diet_meal_items',
    entityId: itemId,
  });

  return {
    success: true,
    data: options.slice(0, 5), // As 5 melhores opções determinísticas
  };
}

/**
 * Aplica uma substituição em plano alimentar de forma absolutamente imutável.
 * Cria uma nova versão/change-set auditável, recalcula macros, calorias e custo,
 * e superseda o plano anterior via RPC transacional PostgreSQL.
 */
export async function applySubstitutionAction(
  planId: string,
  itemId: string,
  newFoodId: string,
  newGrams: number
): Promise<ActionResponse<{ newPlanId: string; version: number }>> {
  const user = await getCurrentUser();
  if (!user) {
    return { error: 'Acesso não autorizado: autenticação requerida.' };
  }

  const adminClient = createAdminClient();

  // 1. Busca plano atual completo com dias, refeições e itens
  const { data: planRow, error: planErr } = await adminClient
    .from('diet_plans')
    .select(`
      *,
      diet_plan_days (
        *,
        diet_meals (
          *,
          diet_meal_items ( * )
        )
      )
    `)
    .eq('id', planId)
    .single();

  if (planErr || !planRow) {
    return { error: 'Plano alimentar não encontrado.' };
  }

  // 2. Valida autorização do usuário
  const isOwner = user.id === planRow.patient_id;
  const canEdit = hasPermission(user, 'diet_plan.edit') || isOwner;
  if (!canEdit) {
    return { error: 'Acesso negado: sem permissão para editar ou substituir itens deste plano.' };
  }

  // 3. Busca alimento substituto
  const { data: newFood, error: foodErr } = await adminClient
    .from('foods')
    .select(`
      id,
      source_id,
      source_food_code,
      name,
      source_type,
      validation_status,
      food_data_sources ( version ),
      food_nutrients (
        amount_per_100g,
        nutrients ( code )
      ),
      food_household_measures ( label, grams )
    `)
    .eq('id', newFoodId)
    .single();

  if (foodErr || !newFood) {
    return { error: 'Alimento substituto selecionado não encontrado.' };
  }

  const rawNewFood = newFood as unknown as {
    id: string;
    source_id?: string | null;
    source_food_code: string;
    name: string;
    source_type: string;
    validation_status?: string;
    food_data_sources: { version: string } | null;
    food_nutrients: RawFoodNutrient[];
    food_household_measures: RawHouseholdMeasure[];
  };

  const nutrientsMap: Record<string, number> = {};
  for (const fn of rawNewFood.food_nutrients || []) {
    const code = fn.nutrients?.code;
    if (code && fn.amount_per_100g !== null) {
      nutrientsMap[code] = Number(fn.amount_per_100g);
    }
  }

  const itemKcal = Number((((nutrientsMap['energy_kcal'] || 0) * newGrams) / 100).toFixed(2));
  const itemProtein = Number((((nutrientsMap['protein'] || 0) * newGrams) / 100).toFixed(2));
  const itemCarb = Number((((nutrientsMap['carbohydrate'] || 0) * newGrams) / 100).toFixed(2));
  const itemFat = Number((((nutrientsMap['lipids'] || 0) * newGrams) / 100).toFixed(2));
  const itemFiber = nutrientsMap['dietary_fiber'] !== undefined ? Number(((nutrientsMap['dietary_fiber'] * newGrams) / 100).toFixed(2)) : null;
  const itemSodium = nutrientsMap['sodium'] !== undefined ? Number(((nutrientsMap['sodium'] * newGrams) / 100).toFixed(2)) : null;

  const hm = rawNewFood.food_household_measures?.[0];
  const hmLabel = hm ? hm.label : null;
  const hmQty = hm ? Number((newGrams / Number(hm.grams)).toFixed(1)) : null;

  const snapshotHash = computeCompositionSnapshotHash({
    food_id: rawNewFood.id,
    energy_kcal: nutrientsMap['energy_kcal'] || 0,
    protein_g: nutrientsMap['protein'] || 0,
    carbohydrate_g: nutrientsMap['carbohydrate'] || 0,
    fat_g: nutrientsMap['lipids'] || 0,
    fiber_g: itemFiber,
    sodium_mg: itemSodium,
  });

  // 4. Clona dias e atualiza o item de forma imutável em memória
  let itemFound = false;
  const newDays = ((planRow.diet_plan_days || []) as unknown as RawPlanDay[])
    .sort((a, b) => a.day_of_week - b.day_of_week)
    .map((day) => {
      let dayKcal = 0;
      let dayProtein = 0;
      let dayCarb = 0;
      let dayFat = 0;
      let dayFiber = 0;
      let daySodium = 0;
      let dayCost = 0;

      const newMeals = ((day.diet_meals || []) as RawPlanMeal[])
        .sort((m1, m2) => m1.meal_order - m2.meal_order)
        .map((meal) => {
          let mealKcal = 0;
          let mealProtein = 0;
          let mealCarb = 0;
          let mealFat = 0;
          let mealFiber = 0;
          let mealSodium = 0;
          let mealCost = 0;

          const newItems: DietMealItemSnapshot[] = ((meal.diet_meal_items || []) as unknown as Array<DietMealItemSnapshot & { id?: string }>)
            .sort((i1, i2) => i1.item_order - i2.item_order)
            .map((item) => {
              if (item.id === itemId) {
                itemFound = true;
                const updatedItem: DietMealItemSnapshot = {
                  food_id: rawNewFood.id,
                  item_order: item.item_order,
                  food_name: rawNewFood.name,
                  source_id: rawNewFood.source_id || null,
                  source_food_code: rawNewFood.source_food_code || null,
                  source_type: rawNewFood.source_type,
                  source_version: rawNewFood.food_data_sources?.version || '4.0.0',
                  grams: newGrams,
                  energy_kcal: itemKcal,
                  protein_g: itemProtein,
                  carbohydrate_g: itemCarb,
                  fat_g: itemFat,
                  fiber_g: itemFiber,
                  sodium_mg: itemSodium,
                  household_measure_label: hmLabel,
                  household_measure_quantity: hmQty,
                  price_estimate: item.price_estimate,
                  price_confidence: item.price_confidence,
                  price_source_level: item.price_source_level,
                  currency: item.currency || 'BRL',
                  composition_snapshot_hash: snapshotHash,
                };
                mealKcal += updatedItem.energy_kcal;
                mealProtein += updatedItem.protein_g;
                mealCarb += updatedItem.carbohydrate_g;
                mealFat += updatedItem.fat_g;
                if (updatedItem.fiber_g) mealFiber += updatedItem.fiber_g;
                if (updatedItem.sodium_mg) mealSodium += updatedItem.sodium_mg;
                if (updatedItem.price_estimate) mealCost += updatedItem.price_estimate;
                return updatedItem;
              }

              mealKcal += item.energy_kcal;
              mealProtein += item.protein_g;
              mealCarb += item.carbohydrate_g;
              mealFat += item.fat_g;
              if (item.fiber_g) mealFiber += item.fiber_g;
              if (item.sodium_mg) mealSodium += item.sodium_mg;
              if (item.price_estimate) mealCost += item.price_estimate;
              return item;
            });

          dayKcal += mealKcal;
          dayProtein += mealProtein;
          dayCarb += mealCarb;
          dayFat += mealFat;
          dayFiber += mealFiber;
          daySodium += mealSodium;
          dayCost += mealCost;

          return {
            meal_order: meal.meal_order,
            meal_type: meal.meal_type as DietMealType,
            meal_name: meal.meal_name as string,
            scheduled_time: meal.scheduled_time as string | null,
            target_calories_kcal: Number(meal.target_calories_kcal),
            target_protein_g: Number(meal.target_protein_g),
            target_carbohydrate_g: Number(meal.target_carbohydrate_g),
            target_fat_g: Number(meal.target_fat_g),
            actual_calories_kcal: Number(mealKcal.toFixed(2)),
            actual_protein_g: Number(mealProtein.toFixed(2)),
            actual_carbohydrate_g: Number(mealCarb.toFixed(2)),
            actual_fat_g: Number(mealFat.toFixed(2)),
            actual_fiber_g: Number(mealFiber.toFixed(2)),
            actual_sodium_mg: Number(mealSodium.toFixed(2)),
            estimated_cost: mealCost > 0 ? Number(mealCost.toFixed(2)) : null,
            items: newItems,
          };
        });

      const targetKcal = Number(day.target_calories_kcal);
      const targetProt = Number(day.target_protein_g);
      const targetCarb = Number(day.target_carbohydrate_g);
      const targetFat = Number(day.target_fat_g);

      const adherence = checkAdherenceTolerances(
        { calories_kcal: targetKcal, protein_g: targetProt, carbohydrate_g: targetCarb, fat_g: targetFat },
        { calories_kcal: dayKcal, protein_g: dayProtein, carbohydrate_g: dayCarb, fat_g: dayFat }
      );

      return {
        day_of_week: day.day_of_week,
        day_label: day.day_label as string,
        target_calories_kcal: targetKcal,
        target_protein_g: targetProt,
        target_carbohydrate_g: targetCarb,
        target_fat_g: targetFat,
        actual_calories_kcal: Number(dayKcal.toFixed(2)),
        actual_protein_g: Number(dayProtein.toFixed(2)),
        actual_carbohydrate_g: Number(dayCarb.toFixed(2)),
        actual_fat_g: Number(dayFat.toFixed(2)),
        actual_fiber_g: Number(dayFiber.toFixed(2)),
        actual_sodium_mg: Number(daySodium.toFixed(2)),
        calories_delta_pct: Number((((dayKcal - targetKcal) / (targetKcal || 1)) * 100).toFixed(2)),
        protein_delta_pct: Number((((dayProtein - targetProt) / (targetProt || 1)) * 100).toFixed(2)),
        carbohydrate_delta_pct: Number((((dayCarb - targetCarb) / (targetCarb || 1)) * 100).toFixed(2)),
        fat_delta_pct: Number((((dayFat - targetFat) / (targetFat || 1)) * 100).toFixed(2)),
        adherence_status: adherence.overall_status,
        estimated_cost: dayCost > 0 ? Number(dayCost.toFixed(2)) : null,
        meals: newMeals,
      };
    });

  if (!itemFound) {
    return { error: 'Item do plano alimentar não encontrado para substituição.' };
  }

  // 5. Recalcula hash determinístico e custos
  const newOutputPlanHash = computeOutputPlanHash(newDays);
  const allDay1Items = newDays[0].meals.flatMap((m) => m.items);
  const pricingEval = evaluatePlanPricing(
    allDay1Items,
    planRow.daily_budget_target,
    planRow.day_count,
    planRow.currency || 'BRL'
  );

  const newVersion = (planRow.version || 1) + 1;
  const autoApprove = planRow.approval_status === 'approved';

  const newPlan: DietPlan = {
    id: '',
    patient_id: planRow.patient_id,
    source_nutrition_engine_run_id: planRow.source_nutrition_engine_run_id,
    source_nutrition_target_id: planRow.source_nutrition_target_id,
    composer_version: planRow.composer_version,
    composer_config_version: planRow.composer_config_version,
    food_dataset_version: planRow.food_dataset_version,
    food_dataset_checksum: planRow.food_dataset_checksum,
    price_engine_version: planRow.price_engine_version,
    generation_reference_at: planRow.generation_reference_at || new Date().toISOString(),
    input_snapshot_hash: planRow.input_snapshot_hash,
    output_plan_hash: newOutputPlanHash,
    generation_status: 'calculated',
    approval_status: autoApprove ? 'approved' : 'draft',
    rejection_reason: null,
    infeasible_reason_codes: [],
    day_count: planRow.day_count,
    daily_budget_target: planRow.daily_budget_target,
    estimated_daily_cost: pricingEval.estimated_daily_cost,
    estimated_weekly_cost: pricingEval.estimated_weekly_cost,
    budget_confidence: pricingEval.budget_confidence,
    budget_status: pricingEval.budget_status,
    currency: pricingEval.currency,
    price_coverage_percentage: pricingEval.price_coverage_percentage,
    version: newVersion,
    superseded_by: null,
    is_active: autoApprove,
    created_by: user.id,
    approved_by: autoApprove ? user.id : null,
    approved_at: autoApprove ? new Date().toISOString() : null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    days: newDays,
  };

  // 6. Transação Atômica via RPC: insere nova versão e superseda a anterior
  const { data: newPlanId, error: rpcError } = await adminClient.rpc('persist_diet_plan_from_service', {
    p_plan: newPlan,
    p_auto_approve: autoApprove,
  });

  if (rpcError || !newPlanId) {
    return { error: `Erro na transação de superseding do plano: ${rpcError?.message || 'Falha no RPC'}` };
  }

  await logAuditEvent({
    actorId: user.id,
    action: 'diet_plan.superseded_by_substitution',
    entityType: 'diet_plans',
    entityId: newPlanId as string,
    metadata: {
      old_plan_id: planId,
      new_plan_id: newPlanId,
      replaced_item_id: itemId,
      new_food_id: newFoodId,
      new_grams: newGrams,
      new_version: newVersion,
    },
  });

  return {
    success: true,
    data: {
      newPlanId: newPlanId as string,
      version: newVersion,
    },
  };
}
