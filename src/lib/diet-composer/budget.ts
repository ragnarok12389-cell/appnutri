// ==============================================================================
// BUDGET ENGINE: DETERMINISTIC PLAN PRICING & BUDGET VERIFICATION
// ==============================================================================

import { FoodPriceObservation } from '@/types/food';
import { getFoodPriceEstimate } from '@/lib/foods/pricing';
import { DietMealItemSnapshot, DietPlanBudgetStatus } from '@/types/diet-plan';
import { COMPOSER_THRESHOLDS } from './config';

export interface PlanPricingEvaluation {
  estimated_daily_cost: number | null;
  estimated_weekly_cost: number | null;
  price_coverage_percentage: number;
  budget_confidence: number;
  budget_status: DietPlanBudgetStatus;
  currency: string;
}

/**
 * Avalia o custo financeiro determinístico de um plano ou dia de dieta
 * utilizando estritamente o motor de preços da Etapa 5.
 *
 * Princípios de Governança Financeira:
 * 1. Preço desconhecido NÃO é zero.
 * 2. Cobertura mínima obrigatória (70%) para validar orçamento.
 * 3. Isolamento cambial estrito.
 */
export function evaluatePlanPricing(
  items: DietMealItemSnapshot[],
  dailyBudgetTarget: number | null,
  dayCount: number = 7,
  targetCurrency: string = 'BRL'
): PlanPricingEvaluation {
  if (items.length === 0) {
    return {
      estimated_daily_cost: null,
      estimated_weekly_cost: null,
      price_coverage_percentage: 0,
      budget_confidence: 0,
      budget_status: 'budget_unverified',
      currency: targetCurrency,
    };
  }

  let totalEstimatedCost = 0;
  let pricedItemsCount = 0;
  let totalConfidence = 0;

  for (const item of items) {
    if (item.price_estimate !== null && item.price_estimate > 0) {
      totalEstimatedCost += item.price_estimate;
      pricedItemsCount++;
      totalConfidence += item.price_confidence;
    }
  }

  const coveragePct = Number(((pricedItemsCount / items.length) * 100).toFixed(2));
  const avgConfidence = pricedItemsCount > 0 ? totalConfidence / pricedItemsCount : 0;
  const weightedConfidence = Number((avgConfidence * (coveragePct / 100)).toFixed(2));

  // Normalização diária (items podem representar 1 dia ou todos os dias)
  const estimatedDailyCost = Number(totalEstimatedCost.toFixed(2));
  const estimatedWeeklyCost = Number((estimatedDailyCost * dayCount).toFixed(2));

  let budgetStatus: DietPlanBudgetStatus = 'budget_unverified';

  if (coveragePct < COMPOSER_THRESHOLDS.MIN_PRICE_COVERAGE_FOR_BUDGET_PCT) {
    budgetStatus = 'budget_unverified';
  } else if (dailyBudgetTarget !== null && dailyBudgetTarget > 0) {
    const allowedLimit = dailyBudgetTarget * (1 + COMPOSER_THRESHOLDS.BUDGET_OVERRUN_TOLERANCE_PCT / 100);
    if (estimatedDailyCost <= allowedLimit) {
      budgetStatus = 'within_budget';
    } else {
      budgetStatus = 'exceeds_budget';
    }
  } else {
    budgetStatus = 'budget_unverified';
  }

  return {
    estimated_daily_cost: coveragePct > 0 ? estimatedDailyCost : null,
    estimated_weekly_cost: coveragePct > 0 ? estimatedWeeklyCost : null,
    price_coverage_percentage: coveragePct,
    budget_confidence: weightedConfidence,
    budget_status: budgetStatus,
    currency: targetCurrency,
  };
}

/**
 * Atribui estimativas de preço em um lote de alimentos candidatos
 * utilizando observações de preço do banco.
 */
export function enrichFoodWithPriceEstimate(
  foodId: string,
  priceObservations: FoodPriceObservation[],
  targetCurrency: string = 'BRL',
  referenceDateIso?: string
): {
  price_per_100g: number | null;
  price_confidence: number;
  price_source_level: string;
} {
  const estimate = getFoodPriceEstimate(foodId, priceObservations, undefined, referenceDateIso, targetCurrency);
  return {
    price_per_100g: estimate.estimated_price_per_100g,
    price_confidence: estimate.price_confidence,
    price_source_level: estimate.price_source_level || 'unknown',
  };
}
