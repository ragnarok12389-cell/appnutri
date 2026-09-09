import {
  GOAL_CALORIC_ADJUSTMENTS,
  ENGINE_OPERATIONAL_GUARDRAILS,
} from '../config';
import { ClampReason, ScreeningReasonCode } from '@/types/nutrition-engine';

export interface EnergyTargetCalculationResult {
  primary_goal: string;
  desired_rate_of_change: string;
  raw_goal_adjustment_kcal: number;
  goal_adjustment_kcal: number;
  goal_adjustment_percentage: number;
  raw_target_calories_nominal_kcal: number;
  target_calories_nominal_kcal: number;
  target_calories_min_kcal: number;
  target_calories_max_kcal: number;
  target_was_clamped: boolean;
  clamp_reason: ClampReason;
  requires_professional_review: boolean;
  review_reason_codes: ScreeningReasonCode[];
}

/**
 * Calcula a meta energética nominal e as faixas calóricas (mínimo, nominal, máximo).
 * Audita clamping contra os Guardrails Operacionais do Motor e verifica limites
 * relativos determinísticos de déficit/superávit em relação ao TDEE.
 */
export function calculateEnergyTarget(
  tdee_kcal: number,
  bmr_kcal: number,
  biological_sex: 'male' | 'female',
  primaryGoal: string,
  rateOfChange: string | null = 'moderate'
): EnergyTargetCalculationResult {
  const goalKey = primaryGoal in GOAL_CALORIC_ADJUSTMENTS ? primaryGoal : 'maintain_weight';
  const rateKey =
    rateOfChange && rateOfChange in GOAL_CALORIC_ADJUSTMENTS[goalKey] ? rateOfChange : 'moderate';

  const rawAdjustment = GOAL_CALORIC_ADJUSTMENTS[goalKey][rateKey] ?? 0;
  const adjustmentPercentage =
    tdee_kcal > 0 ? Math.round((Math.abs(rawAdjustment) / tdee_kcal) * 1000) / 10 : 0;

  const reasonCodes: ScreeningReasonCode[] = [];
  let requiresReview = false;

  // 1. Verificação de Limites Relativos Operacionais da Engine (% do TDEE)
  if (goalKey === 'lose_weight') {
    if (adjustmentPercentage > ENGINE_OPERATIONAL_GUARDRAILS.MAX_ENGINE_DEFICIT_PERCENTAGE_TDEE * 100) {
      requiresReview = true;
      reasonCodes.push('EXCESSIVE_DEFICIT_REQUESTED');
    }
  } else if (goalKey === 'gain_muscle') {
    if (adjustmentPercentage > ENGINE_OPERATIONAL_GUARDRAILS.MAX_ENGINE_SURPLUS_PERCENTAGE_TDEE * 100) {
      requiresReview = true;
      reasonCodes.push('EXCESSIVE_SURPLUS_REQUESTED');
    }
  }

  // 2. Cálculo do Alvo Matemático Pré-Clamp
  const rawNominal = Math.round((tdee_kcal + rawAdjustment) * 100) / 100;

  // 3. Aplicação e Auditoria de Guardrails Operacionais
  const minFloor =
    biological_sex === 'male'
      ? ENGINE_OPERATIONAL_GUARDRAILS.MIN_CALORIES_MALE
      : ENGINE_OPERATIONAL_GUARDRAILS.MIN_CALORIES_FEMALE;
  const maxCeiling = ENGINE_OPERATIONAL_GUARDRAILS.MAX_CALORIES_SAFE_CEILING;

  let targetWasClamped = false;
  let clampReason: ClampReason = null;
  let finalNominal = rawNominal;

  if (rawNominal < minFloor) {
    targetWasClamped = true;
    clampReason =
      biological_sex === 'male' ? 'GUARDRAIL_MIN_FLOOR_MALE' : 'GUARDRAIL_MIN_FLOOR_FEMALE';
    finalNominal = minFloor;
    requiresReview = true;
    reasonCodes.push('GUARDRAIL_CLAMP_APPLIED');
  } else if (rawNominal > maxCeiling) {
    targetWasClamped = true;
    clampReason = 'GUARDRAIL_MAX_CEILING';
    finalNominal = maxCeiling;
    requiresReview = true;
    reasonCodes.push('GUARDRAIL_CLAMP_APPLIED');
  }

  // 4. Faixas Calóricas (Min, Nominal, Max)
  const rangeHalf = ENGINE_OPERATIONAL_GUARDRAILS.TARGET_RANGE_HALF_WIDTH_KCAL;
  const minCal = Math.max(minFloor, Math.round((finalNominal - rangeHalf) * 100) / 100);
  const maxCal = Math.round((finalNominal + rangeHalf) * 100) / 100;

  return {
    primary_goal: goalKey,
    desired_rate_of_change: rateKey,
    raw_goal_adjustment_kcal: rawAdjustment,
    goal_adjustment_kcal: rawAdjustment,
    goal_adjustment_percentage: adjustmentPercentage,
    raw_target_calories_nominal_kcal: rawNominal,
    target_calories_nominal_kcal: finalNominal,
    target_calories_min_kcal: minCal,
    target_calories_max_kcal: maxCal,
    target_was_clamped: targetWasClamped,
    clamp_reason: clampReason,
    requires_professional_review: requiresReview,
    review_reason_codes: reasonCodes,
  };
}
