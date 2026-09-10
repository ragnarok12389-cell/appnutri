// ==============================================================================
// SOLVER: DETERMINISTIC MATHEMATICAL OPTIMIZER FOR MEALS & PORTIONS IN GRAMS
// ==============================================================================

import { NutritionConstraints } from '@/types/nutrition-engine';
import {
  COMPOSER_TOLERANCES,
  PORTION_BOUNDARIES,
  PortionBoundary,
} from './config';
import {
  ComposerCandidateFood,
  MealMacroTargets,
  MealTemplate,
} from './types';
import {
  DietMeal,
  DietMealItemSnapshot,
  MacroAdherenceReportItem,
  MacroAdherenceSummary,
} from '@/types/diet-plan';
import { VarietyTracker } from './variety';
import { computeCompositionSnapshotHash } from './hash';

/**
 * Avalia a aderência de um macronutriente ou calorias em relação à tolerância configurada.
 */
export function evaluateMacroMetric(
  target: number,
  actual: number,
  toleranceConfig: { percentage: number; absolute_min_kcal?: number; absolute_min_g?: number }
): MacroAdherenceReportItem {
  const absoluteDelta = Number(Math.abs(actual - target).toFixed(2));
  const percentageDelta = target > 0 ? Number(((absoluteDelta / target) * 100).toFixed(2)) : 0;

  const allowedAbsolute = toleranceConfig.absolute_min_kcal || toleranceConfig.absolute_min_g || 0;
  const allowedPercentageDelta = target * (toleranceConfig.percentage / 100);
  const effectiveAllowedMargin = Math.max(allowedAbsolute, allowedPercentageDelta);

  let status: 'within_tolerance' | 'exceeds' | 'below' = 'within_tolerance';
  if (actual > target + effectiveAllowedMargin) {
    status = 'exceeds';
  } else if (actual < target - effectiveAllowedMargin) {
    status = 'below';
  }

  return {
    target: Number(target.toFixed(2)),
    actual: Number(actual.toFixed(2)),
    absolute_delta: absoluteDelta,
    percentage_delta: percentageDelta,
    status,
  };
}

/**
 * Gera o relatório completo de aderência nutricional para calorias e macronutrientes.
 */
export function checkAdherenceTolerances(
  targets: {
    calories_kcal: number;
    protein_g: number;
    carbohydrate_g: number;
    fat_g: number;
  },
  actuals: {
    calories_kcal: number;
    protein_g: number;
    carbohydrate_g: number;
    fat_g: number;
  }
): MacroAdherenceSummary {
  const calories = evaluateMacroMetric(targets.calories_kcal, actuals.calories_kcal, COMPOSER_TOLERANCES.CALORIES);
  const protein = evaluateMacroMetric(targets.protein_g, actuals.protein_g, COMPOSER_TOLERANCES.PROTEIN);
  const carbohydrate = evaluateMacroMetric(targets.carbohydrate_g, actuals.carbohydrate_g, COMPOSER_TOLERANCES.CARBOHYDRATE);
  const fat = evaluateMacroMetric(targets.fat_g, actuals.fat_g, COMPOSER_TOLERANCES.FAT);

  const isWithinTolerance =
    calories.status === 'within_tolerance' &&
    protein.status === 'within_tolerance' &&
    carbohydrate.status === 'within_tolerance' &&
    fat.status === 'within_tolerance';

  return {
    calories,
    protein,
    carbohydrate,
    fat,
    overall_status: isWithinTolerance ? 'within_tolerance' : 'out_of_tolerance',
  };
}

function cleanStr(str: string): string {
  return (str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Obtém os limites de porção em gramas para um grupo alimentar.
 */
export function getPortionBoundary(food: ComposerCandidateFood): PortionBoundary {
  const fg = cleanStr(food.food_group);
  const name = cleanStr(food.normalized_name || food.name);

  if (food.role === 'lipid' || fg.includes('oleo') || fg.includes('azeite') || fg.includes('gordura')) {
    return PORTION_BOUNDARIES.oils_fats;
  }
  if (name.includes('ovo') || fg.includes('ovo')) {
    return PORTION_BOUNDARIES.eggs;
  }
  if (fg.includes('carne') || fg.includes('pescado') || fg.includes('frango')) {
    return PORTION_BOUNDARIES.meat_poultry_fish;
  }
  if (fg.includes('leite') || fg.includes('iogurte')) {
    return PORTION_BOUNDARIES.dairy_liquid_yogurt;
  }
  if (fg.includes('queijo')) {
    return PORTION_BOUNDARIES.dairy_cheese;
  }
  if (food.role === 'legume' || fg.includes('leguminosa') || name.includes('feijao') || name.includes('lentilha')) {
    return PORTION_BOUNDARIES.legumes;
  }
  if (fg.includes('cereal') || name.includes('arroz') || name.includes('aveia') || name.includes('pao')) {
    return PORTION_BOUNDARIES.grains_cereals;
  }
  if (fg.includes('tuberculo') || name.includes('batata') || name.includes('mandioca')) {
    return PORTION_BOUNDARIES.tubers_roots;
  }
  if (fg.includes('castanha') || fg.includes('nozes')) {
    return PORTION_BOUNDARIES.nuts_seeds;
  }
  if (food.role === 'fruit' || fg.includes('fruta')) {
    return PORTION_BOUNDARIES.fruits;
  }
  if (food.role === 'vegetable' || fg.includes('verdura') || fg.includes('hortalica') || name.includes('alface') || name.includes('brocolis')) {
    return PORTION_BOUNDARIES.vegetables_leafy;
  }

  return PORTION_BOUNDARIES.default;
}

/**
 * Pontua deterministicamente a adequação de um alimento para uma refeição.
 */
function scoreCandidateForMeal(
  food: ComposerCandidateFood,
  constraints: NutritionConstraints,
  varietyTracker: VarietyTracker,
  dayIndex: number,
  mealType: string,
  slotRole?: string,
  mealTargets?: MealMacroTargets
): number {
  let score = 100;
  const normName = food.normalized_name;

  // 1. Bônus de Favorito (+50)
  if ((constraints.favorite_foods || []).some((f) => normName.includes(f.toLowerCase()))) {
    score += 50;
  }

  // 2. Bônus de Fontes Preferidas (+25)
  if (food.role === 'protein' && (constraints.preferred_protein_sources || []).some((p) => normName.includes(p.toLowerCase()))) {
    score += 25;
  }
  if (food.role === 'carb' && (constraints.preferred_carbohydrate_sources || []).some((c) => normName.includes(c.toLowerCase()))) {
    score += 25;
  }
  if (food.role === 'lipid' && (constraints.preferred_fat_sources || []).some((f) => normName.includes(f.toLowerCase()))) {
    score += 25;
  }

  // 2.1 Capacidade de suprir a meta proteica da refeição principal
  if (slotRole === 'protein' && mealTargets && mealTargets.protein_g >= 25) {
    const bounds = getPortionBoundary(food);
    const maxPossibleProtein = (food.protein_g_100g * bounds.maxGrams) / 100;
    if (maxPossibleProtein < mealTargets.protein_g * 0.6) {
      score -= 60; // Incapaz de fornecer densidade proteica para refeição principal
    } else {
      score += 25;
    }
  }

  // 2.2 Adequação nutricional ao papel do slot. O catálogo TACO contém
  // centenas de itens por grupo; sem este critério, o desempate alfabético
  // podia escolher cortes gordurosos para proteína e fontes pouco densas
  // para carboidrato, tornando uma meta viável matematicamente inalcançável.
  if (slotRole === 'protein') {
    score += Math.min(80, food.protein_g_100g * 2);
    const fatProteinRatio = food.protein_g_100g > 0
      ? food.fat_g_100g / food.protein_g_100g
      : 2;
    const mealFatProteinRatio = mealTargets && mealTargets.protein_g > 0
      ? mealTargets.fat_g / mealTargets.protein_g
      : 0.4;
    // Reserva parte da gordura para o slot lipídico e evita tanto cortes
    // excessivamente gordurosos quanto proteínas secas demais para a meta.
    const preferredRatio = Math.max(0.12, Math.min(0.3, mealFatProteinRatio * 0.5));
    score -= Math.min(80, Math.abs(fatProteinRatio - preferredRatio) * 180);
    if ((food.sodium_mg_100g ?? 0) > 800) score -= 25;
  } else if (slotRole === 'carb') {
    score += Math.min(80, food.carbohydrate_g_100g * 1.5);
    score -= Math.min(50, food.fat_g_100g * 2);
  } else if (slotRole === 'legume') {
    score += Math.min(50, food.protein_g_100g + food.carbohydrate_g_100g);
    score -= Math.min(60, food.fat_g_100g * 3);
  } else if (slotRole === 'lipid') {
    score += Math.min(160, food.fat_g_100g * 1.6);
    score -= Math.min(50, food.carbohydrate_g_100g * 2);
  }

  // 2.3 Penalidade Suave de Alimentos Desgostados (-40) (soft preference)
  if ((constraints.disliked_foods || []).some((d) => normName.includes(d.toLowerCase()))) {
    score -= 40;
  }

  // 3. Penalidade de Repetição (Variedade)
  const repPenalty = varietyTracker.getRepetitionPenalty(dayIndex, mealType, food);
  score -= Math.round(repPenalty * 60);

  // 4. Custo (favorece alimentos mais acessíveis se houver orçamento)
  if (food.price_per_100g !== null && food.price_per_100g > 0) {
    if (food.price_per_100g < 2.0) {
      score += 15;
    } else if (food.price_per_100g > 10.0) {
      score -= 15;
    }
  }

  return score;
}

/**
 * Monta uma refeição determinística atribuindo alimentos e porções em gramas.
 */
export function composeDeterministicMeal(
  template: MealTemplate,
  mealTargets: MealMacroTargets,
  eligibleFoods: ComposerCandidateFood[],
  constraints: NutritionConstraints,
  varietyTracker: VarietyTracker,
  dayIndex: number,
  mealOrder: number,
  targetCurrency: string = 'BRL'
): DietMeal {
  const selectedItems: DietMealItemSnapshot[] = [];

  // Mapear candidatos por papel
  const foodsByRole: Record<string, ComposerCandidateFood[]> = {
    protein: eligibleFoods.filter((f) => f.role === 'protein' || f.role === 'dairy'),
    carb: eligibleFoods.filter((f) => f.role === 'carb'),
    legume: eligibleFoods.filter((f) => f.role === 'legume'),
    vegetable: eligibleFoods.filter((f) => f.role === 'vegetable'),
    fruit: eligibleFoods.filter((f) => f.role === 'fruit'),
    lipid: eligibleFoods.filter((f) => f.role === 'lipid'),
    other: eligibleFoods,
  };

  // Se não houver legumes, fallback para carb
  if (foodsByRole.legume.length === 0) {
    foodsByRole.legume = foodsByRole.carb;
  }

  // 1. Seleciona 1 alimento para cada slot da refeição
  const chosenFoods: Array<{ slot: typeof template.slots[0]; food: ComposerCandidateFood }> = [];

  for (const slot of template.slots) {
    const candidates = foodsByRole[slot.role] || eligibleFoods;
    if (candidates.length === 0) {
      if (!slot.is_optional) {
        // Fallback para qualquer alimento elegível
        if (eligibleFoods.length > 0) {
          chosenFoods.push({ slot, food: eligibleFoods[0] });
        }
      }
      continue;
    }

    // Ordenar candidatos por score e desempate determinístico
    const scored = [...candidates].sort((a, b) => {
      const scoreA = scoreCandidateForMeal(a, constraints, varietyTracker, dayIndex, template.meal_type, slot.role, mealTargets);
      const scoreB = scoreCandidateForMeal(b, constraints, varietyTracker, dayIndex, template.meal_type, slot.role, mealTargets);
      if (scoreA !== scoreB) return scoreB - scoreA; // Maior score primeiro
      if (a.normalized_name !== b.normalized_name) return a.normalized_name.localeCompare(b.normalized_name);
      return a.id.localeCompare(b.id);
    });

    // Evita selecionar o mesmo alimento duas vezes na mesma refeição
    const alreadyChosenIds = new Set(chosenFoods.map((c) => c.food.id));
    const bestFood = scored.find((c) => !alreadyChosenIds.has(c.id)) || scored[0];

    chosenFoods.push({ slot, food: bestFood });
  }

  // 2. Otimização Discreta de Gramagens
  // Inicializar porções padrão realistas
  const portions: Map<string, number> = new Map();

  for (const { food } of chosenFoods) {
    const bounds = getPortionBoundary(food);
    // Inicializar na porção média realista
    const initialGrams = Math.round((bounds.minGrams + bounds.maxGrams) / (2 * bounds.stepGrams)) * bounds.stepGrams;
    portions.set(food.id, initialGrams);
  }

  // Identificar papéis primários para direcionar a alocação de macros
  const proteinItem = chosenFoods.find((c) => c.slot.role === 'protein');
  const carbItem = chosenFoods.find((c) => c.slot.role === 'carb');
  const lipidItem = chosenFoods.find((c) => c.slot.role === 'lipid');

  // Ajuste inicial por macronutriente primário
  if (proteinItem && proteinItem.food.protein_g_100g > 0) {
    const pBounds = getPortionBoundary(proteinItem.food);
    const targetGrams = (mealTargets.protein_g / proteinItem.food.protein_g_100g) * 100;
    const clampedGrams = Math.max(pBounds.minGrams, Math.min(pBounds.maxGrams, targetGrams));
    const roundedGrams = Math.round(clampedGrams / pBounds.stepGrams) * pBounds.stepGrams;
    portions.set(proteinItem.food.id, roundedGrams);
  }

  if (carbItem && carbItem.food.carbohydrate_g_100g > 0) {
    const cBounds = getPortionBoundary(carbItem.food);
    const targetGrams = (mealTargets.carbohydrate_g / carbItem.food.carbohydrate_g_100g) * 100;
    const clampedGrams = Math.max(cBounds.minGrams, Math.min(cBounds.maxGrams, targetGrams));
    const roundedGrams = Math.round(clampedGrams / cBounds.stepGrams) * cBounds.stepGrams;
    portions.set(carbItem.food.id, roundedGrams);
  }

  if (lipidItem && lipidItem.food.fat_g_100g > 0) {
    const lBounds = getPortionBoundary(lipidItem.food);
    const targetGrams = (mealTargets.fat_g / lipidItem.food.fat_g_100g) * 100;
    const clampedGrams = Math.max(lBounds.minGrams, Math.min(lBounds.maxGrams, targetGrams));
    const roundedGrams = Math.round(clampedGrams / lBounds.stepGrams) * lBounds.stepGrams;
    portions.set(lipidItem.food.id, roundedGrams);
  }

  // Otimizador de Micro-Passos Determinístico (Coordinate Descent na Refeição)
  function computeMealLoss(): number {
    let currentKcal = 0;
    let currentProtein = 0;
    let currentCarb = 0;
    let currentFat = 0;

    for (const { food } of chosenFoods) {
      const g = portions.get(food.id) || 0;
      currentKcal += (food.energy_kcal_100g * g) / 100;
      currentProtein += (food.protein_g_100g * g) / 100;
      currentCarb += (food.carbohydrate_g_100g * g) / 100;
      currentFat += (food.fat_g_100g * g) / 100;
    }

    const kcalNorm = mealTargets.calories_kcal > 0 ? mealTargets.calories_kcal : 1;
    const protNorm = mealTargets.protein_g > 0 ? mealTargets.protein_g : 1;
    const carbNorm = mealTargets.carbohydrate_g > 0 ? mealTargets.carbohydrate_g : 1;
    const fatNorm = mealTargets.fat_g > 0 ? mealTargets.fat_g : 1;

    const kcalDiff = (currentKcal - mealTargets.calories_kcal) / kcalNorm;
    const protDiff = (currentProtein - mealTargets.protein_g) / protNorm;
    const carbDiff = (currentCarb - mealTargets.carbohydrate_g) / carbNorm;
    const fatDiff = (currentFat - mealTargets.fat_g) / fatNorm;

    return (
      2.0 * kcalDiff * kcalDiff +
      3.0 * protDiff * protDiff +
      1.5 * carbDiff * carbDiff +
      1.5 * fatDiff * fatDiff
    );
  }

  // Itera até convergência discreta determinística (máx 15 iterações)
  for (let iter = 0; iter < 15; iter++) {
    let improved = false;
    for (const { food } of chosenFoods) {
      const bounds = getPortionBoundary(food);
      const currentG = portions.get(food.id) || bounds.minGrams;
      const baseLoss = computeMealLoss();

      // Testa incremento (+ step)
      if (currentG + bounds.stepGrams <= bounds.maxGrams) {
        portions.set(food.id, currentG + bounds.stepGrams);
        const lossUp = computeMealLoss();
        if (lossUp < baseLoss - 1e-4) {
          improved = true;
          continue;
        }
      }

      // Testa decremento (- step)
      if (currentG - bounds.stepGrams >= bounds.minGrams) {
        portions.set(food.id, currentG - bounds.stepGrams);
        const lossDown = computeMealLoss();
        if (lossDown < baseLoss - 1e-4) {
          improved = true;
          continue;
        }
      }

      // Restaura se nenhum melhorou
      portions.set(food.id, currentG);
    }

    if (!improved) break;
  }

  // 3. Montar snapshots dos itens com precisão matemática
  let actualKcal = 0;
  let actualProtein = 0;
  let actualCarb = 0;
  let actualFat = 0;
  let actualFiber = 0;
  let actualSodium = 0;
  let estimatedCost = 0;

  for (let i = 0; i < chosenFoods.length; i++) {
    const { food } = chosenFoods[i];
    const grams = portions.get(food.id) || 100;

    const itemKcal = Number(((food.energy_kcal_100g * grams) / 100).toFixed(2));
    const itemProtein = Number(((food.protein_g_100g * grams) / 100).toFixed(2));
    const itemCarb = Number(((food.carbohydrate_g_100g * grams) / 100).toFixed(2));
    const itemFat = Number(((food.fat_g_100g * grams) / 100).toFixed(2));
    const itemFiber = food.fiber_g_100g !== null ? Number(((food.fiber_g_100g * grams) / 100).toFixed(2)) : null;
    const itemSodium = food.sodium_mg_100g !== null ? Number(((food.sodium_mg_100g * grams) / 100).toFixed(2)) : null;

    const itemPrice = food.price_per_100g !== null ? Number(((food.price_per_100g * grams) / 100).toFixed(4)) : null;

    // Medida caseira apenas se comprovada (TACO/IBGE)
    let householdMeasureLabel: string | null = null;
    let householdMeasureQty: number | null = null;

    if (food.household_measure && food.household_measure.grams > 0) {
      householdMeasureLabel = food.household_measure.label;
      householdMeasureQty = Number((grams / food.household_measure.grams).toFixed(1));
    }

    const snapshotHash = computeCompositionSnapshotHash({
      food_id: food.id,
      energy_kcal: food.energy_kcal_100g,
      protein_g: food.protein_g_100g,
      carbohydrate_g: food.carbohydrate_g_100g,
      fat_g: food.fat_g_100g,
      fiber_g: food.fiber_g_100g,
      sodium_mg: food.sodium_mg_100g,
    });

    const itemSnapshot: DietMealItemSnapshot = {
      food_id: food.id,
      item_order: i + 1,
      food_name: food.name,
      source_id: food.source_id || null,
      source_food_code: food.source_food_code || null,
      source_type: food.source_type,
      source_version: food.source_version,
      grams,
      energy_kcal: itemKcal,
      protein_g: itemProtein,
      carbohydrate_g: itemCarb,
      fat_g: itemFat,
      fiber_g: itemFiber,
      sodium_mg: itemSodium,
      household_measure_label: householdMeasureLabel,
      household_measure_quantity: householdMeasureQty,
      price_estimate: itemPrice,
      price_confidence: food.price_confidence,
      price_source_level: food.price_source_level,
      currency: targetCurrency,
      composition_snapshot_hash: snapshotHash,
    };

    selectedItems.push(itemSnapshot);

    actualKcal += itemKcal;
    actualProtein += itemProtein;
    actualCarb += itemCarb;
    actualFat += itemFat;
    if (itemFiber) actualFiber += itemFiber;
    if (itemSodium) actualSodium += itemSodium;
    if (itemPrice) estimatedCost += itemPrice;
  }

  return {
    meal_order: mealOrder,
    meal_type: template.meal_type,
    meal_name: template.meal_name,
    scheduled_time: template.scheduled_time,
    target_calories_kcal: Number(mealTargets.calories_kcal.toFixed(2)),
    target_protein_g: Number(mealTargets.protein_g.toFixed(2)),
    target_carbohydrate_g: Number(mealTargets.carbohydrate_g.toFixed(2)),
    target_fat_g: Number(mealTargets.fat_g.toFixed(2)),
    actual_calories_kcal: Number(actualKcal.toFixed(2)),
    actual_protein_g: Number(actualProtein.toFixed(2)),
    actual_carbohydrate_g: Number(actualCarb.toFixed(2)),
    actual_fat_g: Number(actualFat.toFixed(2)),
    actual_fiber_g: Number(actualFiber.toFixed(2)),
    actual_sodium_mg: Number(actualSodium.toFixed(2)),
    estimated_cost: estimatedCost > 0 ? Number(estimatedCost.toFixed(2)) : null,
    items: selectedItems,
  };
}
