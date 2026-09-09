import { BudgetEstimateType } from '@/types/nutrition-engine';

export interface BudgetNormalizationResult {
  normalized_daily_budget: number;
  normalized_weekly_budget: number;
  normalized_monthly_budget: number;
  currency: string;
  budget_estimate_type: BudgetEstimateType;
  calories_per_meal_average: number;
  estimated_cost_per_meal: number;
  meal_count: number;
}

const DAYS_IN_MONTH = 30.4375;

export function normalizeBudgetAndMeals(
  rawAmount: number | null | undefined,
  period: string | null | undefined = 'monthly',
  isExclusiveForPatient: boolean = true,
  peopleInHousehold: number | null | undefined = 1,
  desiredMealsPerDay: number | null | undefined = 4,
  targetCaloriesNominal: number = 2000,
  currency: string = 'BRL'
): BudgetNormalizationResult {
  const amount = rawAmount !== null && rawAmount !== undefined && rawAmount >= 0 ? rawAmount : 600;
  const householdCount = Math.max(1, peopleInHousehold || 1);
  const mealsCount = Math.max(1, Math.min(10, desiredMealsPerDay || 4));

  // Determina o valor base considerando exclusividade ou rateio domiciliar
  const estimateType: BudgetEstimateType = isExclusiveForPatient ? 'individual_exact' : 'household_proportional';
  const effectiveBaseAmount = isExclusiveForPatient ? amount : amount / householdCount;

  let daily: number;
  let weekly: number;
  let monthly: number;

  switch (period) {
    case 'daily': {
      daily = effectiveBaseAmount;
      weekly = daily * 7;
      monthly = daily * DAYS_IN_MONTH;
      break;
    }
    case 'weekly': {
      weekly = effectiveBaseAmount;
      daily = weekly / 7;
      monthly = daily * DAYS_IN_MONTH;
      break;
    }
    case 'monthly':
    default: {
      monthly = effectiveBaseAmount;
      daily = monthly / DAYS_IN_MONTH;
      weekly = daily * 7;
      break;
    }
  }

  const roundedDaily = Math.round(daily * 100) / 100;
  const roundedWeekly = Math.round(weekly * 100) / 100;
  const roundedMonthly = Math.round(monthly * 100) / 100;

  const caloriesPerMeal = Math.round((targetCaloriesNominal / mealsCount) * 10) / 10;
  const costPerMeal = Math.round((roundedDaily / mealsCount) * 100) / 100;

  return {
    normalized_daily_budget: roundedDaily,
    normalized_weekly_budget: roundedWeekly,
    normalized_monthly_budget: roundedMonthly,
    currency,
    budget_estimate_type: estimateType,
    calories_per_meal_average: caloriesPerMeal,
    estimated_cost_per_meal: costPerMeal,
    meal_count: mealsCount,
  };
}
