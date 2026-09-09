import { NutrientDataQuality, PortionNutritionResult } from '@/types/food';

export interface BaseNutrientInfo {
  code: string;
  name: string;
  unit: string;
  amount_per_100g: number | null;
  data_quality: NutrientDataQuality;
}

/**
 * Calcula a composição nutricional determinística de uma porção personalizada de alimento em gramas.
 *
 * Princípio da Proporcionalidade Estrita:
 * Quantidade = (gramas / 100) * quantidade_por_100g
 *
 * Valores nulos (não analisados) permanecem estritamente nulos, sem conversão para zero.
 */
export function calculatePortionNutrition(
  foodId: string,
  foodName: string,
  baseNutrientsPer100g: Record<string, BaseNutrientInfo>,
  grams: number,
  measureLabel?: string | null,
  estimatedPortionCost: number | null = null,
  currency: string = 'BRL'
): PortionNutritionResult {
  if (grams < 0) {
    throw new Error('A quantidade em gramas para a porção não pode ser negativa.');
  }

  const factor = grams / 100;
  const calculatedNutrients: PortionNutritionResult['nutrients'] = {};

  for (const [code, item] of Object.entries(baseNutrientsPer100g)) {
    let scaledAmount: number | null = null;

    if (item.amount_per_100g !== null) {
      scaledAmount = Math.round(item.amount_per_100g * factor * 10000) / 10000;
    }

    calculatedNutrients[code] = {
      code: item.code,
      name: item.name,
      unit: item.unit,
      amount: scaledAmount,
      data_quality: item.data_quality,
    };
  }

  return {
    food_id: foodId,
    food_name: foodName,
    grams,
    measure_label: measureLabel || null,
    nutrients: calculatedNutrients,
    estimated_portion_cost: estimatedPortionCost,
    currency,
  };
}

/**
 * Converte uma medida caseira em gramas multiplicando pela quantidade de medidas.
 * Exemplo: 2 colheres de sopa de arroz (25g cada) = 50g.
 */
export function convertHouseholdMeasureToGrams(
  gramsPerUnit: number,
  quantity: number
): number {
  if (gramsPerUnit <= 0 || quantity < 0) {
    throw new Error('A medida caseira em gramas e a quantidade devem ser valores positivos.');
  }
  return Math.round(gramsPerUnit * quantity * 100) / 100;
}
