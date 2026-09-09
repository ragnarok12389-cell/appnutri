// ==============================================================================
// VARIETY ENGINE: DETERMINISTIC INTER-DAY FOOD AND PROTEIN ROTATION
// ==============================================================================

import { ComposerCandidateFood } from './types';

export interface DayUsageHistory {
  dayIndex: number;
  foodIds: Set<string>;
  mealFoodIds: Map<string, Set<string>>; // mealType -> foodIds
  proteinFoodIds: Set<string>;
}

export class VarietyTracker {
  private history: Map<number, DayUsageHistory> = new Map();

  public recordDayUsage(
    dayIndex: number,
    meals: Array<{ meal_type: string; items: Array<{ food_id: string; role?: string }> }>
  ): void {
    const foodIds = new Set<string>();
    const mealFoodIds = new Map<string, Set<string>>();
    const proteinFoodIds = new Set<string>();

    for (const meal of meals) {
      const currentMealFoods = mealFoodIds.get(meal.meal_type) || new Set<string>();
      for (const item of meal.items) {
        foodIds.add(item.food_id);
        currentMealFoods.add(item.food_id);
        if (item.role === 'protein') {
          proteinFoodIds.add(item.food_id);
        }
      }
      mealFoodIds.set(meal.meal_type, currentMealFoods);
    }

    this.history.set(dayIndex, {
      dayIndex,
      foodIds,
      mealFoodIds,
      proteinFoodIds,
    });
  }

  /**
   * Calcula a penalidade de repetição (0.0 a 1.0) para um candidato em determinado dia e refeição.
   * Regras Determinísticas:
   * - Repetido ontem na MESMA refeição: 0.40
   * - Repetido ontem em QUALQUER refeição: 0.20
   * - Mesma fonte proteica ontem: 0.35
   * - Usado há 2 dias: 0.10
   */
  public getRepetitionPenalty(
    dayIndex: number,
    mealType: string,
    food: ComposerCandidateFood
  ): number {
    let penalty = 0;

    // Ontem (dayIndex - 1)
    const yesterday = this.history.get(dayIndex - 1);
    if (yesterday) {
      if (yesterday.mealFoodIds.get(mealType)?.has(food.id)) {
        penalty += 0.40;
      } else if (yesterday.foodIds.has(food.id)) {
        penalty += 0.20;
      }

      if (food.role === 'protein' && yesterday.proteinFoodIds.has(food.id)) {
        penalty += 0.35;
      }
    }

    // Anteontem (dayIndex - 2)
    const twoDaysAgo = this.history.get(dayIndex - 2);
    if (twoDaysAgo) {
      if (twoDaysAgo.mealFoodIds.get(mealType)?.has(food.id)) {
        penalty += 0.15;
      }
    }

    return Math.min(1.0, penalty);
  }
}
