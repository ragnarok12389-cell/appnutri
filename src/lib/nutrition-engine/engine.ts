import {
  NutritionEngineInput,
  NutritionEngineOutput,
  NutritionTargetData,
  ScreeningReasonCode,
} from '@/types/nutrition-engine';
import { ENGINE_VERSION, CONFIG_VERSION } from './config';
import { calculateMifflinStJeor } from './formulas/bmr/mifflin-st-jeor';
import { calculateTdee } from './formulas/tdee';
import { calculateEnergyTarget } from './formulas/energy-target';
import { calculateMacronutrients } from './formulas/macros';
import { normalizeBudgetAndMeals } from './formulas/budget';
import { performSafetyScreening } from './safety/screening';
import { buildNutritionConstraints } from './constraints';
import { calculateEngineInputHashes, calculateSha256 } from './hash';

/**
 * Motor Nutricional Determinístico (Etapa 4 - Hardening).
 * 
 * Função pura, sem efeitos colaterais, sem dependências de rede e independente de IA.
 * Garante reprodutibilidade estrita:
 *   Mesmo Snapshot + Mesma Engine Version + Mesma Config Version => Mesmo Input Hash & Output Idêntico.
 */
export function runNutritionEngine(input: NutritionEngineInput): NutritionEngineOutput {
  const engine_version = input.engine_version || ENGINE_VERSION;
  const config_version = input.config_version || CONFIG_VERSION;
  const snapshot = input.snapshot || {};
  const sensitiveSnapshot = input.sensitive_snapshot || null;

  // 1. Cálculo Determinístico dos Hashes de Entrada Modulares (sem texto livre)
  const { input_snapshot_hash, safety_input_hash, engine_config_hash, input_hash } =
    calculateEngineInputHashes(snapshot, sensitiveSnapshot, engine_version, config_version);

  // 2. Camada de Triagem e Elegibilidade Clínica (Safety Screening)
  const screening = performSafetyScreening(snapshot, sensitiveSnapshot);

  // Caso os dados biométricos essenciais ou activity_level sejam ausentes/inválidos
  if (screening.status === 'insufficient_data') {
    const fallbackConstraints = buildNutritionConstraints(snapshot, sensitiveSnapshot);
    const clinical_review = {
      requires_professional_review: false,
      clinical_reason_codes: screening.review_reason_codes,
      clinical_review_notes: null,
    };
    const output_hash = calculateSha256({
      status: 'insufficient_data',
      clinical_review,
    });

    return {
      engine_version,
      config_version,
      status: 'insufficient_data',
      requires_professional_review: false,
      clinical_review,
      input_hash,
      input_snapshot_hash,
      safety_input_hash,
      engine_config_hash,
      output_hash,
      targets: null,
      constraints: fallbackConstraints,
    };
  }

  // 3. Execução das Fórmulas Fisiológicas e Matemáticas
  const ageYears = screening.age_years || 30;

  // A. BMR / TMB (Mifflin-St Jeor)
  const bmrResult = calculateMifflinStJeor({
    weight_kg: snapshot.current_weight_kg!,
    height_cm: snapshot.height_cm!,
    age_years: ageYears,
    biological_sex: snapshot.biological_sex as 'male' | 'female',
  });

  // B. TDEE (Gasto Energético Diário Estimado - sem fallback silencioso)
  const tdeeResult = calculateTdee(bmrResult.bmr_kcal, snapshot.activity_level!);

  // C. Meta Calórica e Faixa Energética (com auditoria de Guardrails Operacionais e limites relativos)
  const energyTargetResult = calculateEnergyTarget(
    tdeeResult.tdee_kcal,
    bmrResult.bmr_kcal,
    snapshot.biological_sex as 'male' | 'female',
    snapshot.primary_goal || 'maintain_weight',
    snapshot.desired_rate_of_change || 'moderate'
  );

  // D. Distribuição de Macronutrientes com Estratégia de Peso de Referência e Invariantes
  const macroResult = calculateMacronutrients(
    energyTargetResult.target_calories_nominal_kcal,
    snapshot.current_weight_kg!,
    snapshot.height_cm!,
    snapshot.primary_goal || 'maintain_weight'
  );

  // E. Normalização Orçamentária e Distribuição por Refeição
  const budgetResult = normalizeBudgetAndMeals(
    snapshot.food_budget_amount,
    snapshot.food_budget_period,
    snapshot.is_budget_exclusive_for_patient,
    snapshot.number_of_people_in_household,
    snapshot.desired_meals_per_day,
    energyTargetResult.target_calories_nominal_kcal,
    snapshot.currency || 'BRL'
  );

  // F. Compilação das Restrições para Futuro Motor de Alimentos
  const constraints = buildNutritionConstraints(
    snapshot,
    sensitiveSnapshot,
    budgetResult.normalized_daily_budget,
    budgetResult.budget_estimate_type,
    budgetResult.currency
  );

  // Consolidação de Reason Codes e Status de Revisão
  const combinedReasonCodes: ScreeningReasonCode[] = Array.from(
    new Set([
      ...screening.review_reason_codes,
      ...energyTargetResult.review_reason_codes,
      ...macroResult.review_reason_codes,
    ])
  );

  const requiresReview =
    screening.requires_professional_review ||
    energyTargetResult.requires_professional_review ||
    macroResult.requires_professional_review;

  const finalStatus = requiresReview ? 'review_required' : 'calculated';

  // G. Objeto de Alvos Estruturados
  const targets: NutritionTargetData = {
    estimated_bmr_kcal: bmrResult.bmr_kcal,
    bmr_formula: bmrResult.formula,
    bmr_formula_version: bmrResult.formula_version,
    activity_level: tdeeResult.activity_level,
    activity_factor: tdeeResult.activity_factor,
    estimated_tdee_kcal: tdeeResult.tdee_kcal,
    primary_goal: energyTargetResult.primary_goal,
    desired_rate_of_change: energyTargetResult.desired_rate_of_change,
    raw_goal_adjustment_kcal: energyTargetResult.raw_goal_adjustment_kcal,
    goal_adjustment_kcal: energyTargetResult.goal_adjustment_kcal,
    goal_adjustment_percentage: energyTargetResult.goal_adjustment_percentage,
    raw_target_calories_nominal_kcal: energyTargetResult.raw_target_calories_nominal_kcal,
    target_calories_nominal_kcal: energyTargetResult.target_calories_nominal_kcal,
    target_calories_min_kcal: energyTargetResult.target_calories_min_kcal,
    target_calories_max_kcal: energyTargetResult.target_calories_max_kcal,
    target_was_clamped: energyTargetResult.target_was_clamped,
    clamp_reason: energyTargetResult.clamp_reason,
    macro_reference_weight_kg: macroResult.macro_reference_weight_kg,
    macro_reference_weight_strategy: macroResult.macro_reference_weight_strategy,
    protein_g: macroResult.protein_g,
    carbohydrate_g: macroResult.carbohydrate_g,
    fat_g: macroResult.fat_g,
    protein_kcal: macroResult.protein_kcal,
    carbohydrate_kcal: macroResult.carbohydrate_kcal,
    fat_kcal: macroResult.fat_kcal,
    protein_percentage: macroResult.protein_percentage,
    carbohydrate_percentage: macroResult.carbohydrate_percentage,
    fat_percentage: macroResult.fat_percentage,
    desired_meals_per_day: budgetResult.meal_count,
    calories_per_meal_average: budgetResult.calories_per_meal_average,
    normalized_daily_budget: budgetResult.normalized_daily_budget,
    normalized_weekly_budget: budgetResult.normalized_weekly_budget,
    normalized_monthly_budget: budgetResult.normalized_monthly_budget,
    currency: budgetResult.currency,
    budget_estimate_type: budgetResult.budget_estimate_type,
    calculation_confidence: requiresReview ? 0.75 : 1.0,
  };

  const clinical_review = {
    requires_professional_review: requiresReview,
    clinical_reason_codes: combinedReasonCodes,
    clinical_review_notes: null,
  };

  // 4. Hash Determinístico da Saída
  const outputPayload = {
    targets,
    constraints,
    status: finalStatus,
    clinical_review,
  };
  const output_hash = calculateSha256(outputPayload);

  return {
    engine_version,
    config_version,
    status: finalStatus,
    requires_professional_review: requiresReview,
    clinical_review,
    input_hash,
    input_snapshot_hash,
    safety_input_hash,
    engine_config_hash,
    output_hash,
    targets,
    constraints,
  };
}
