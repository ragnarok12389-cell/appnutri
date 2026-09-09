import {
  FoodEconomicNutritionalMetrics,
  FoodPriceObservation,
  PriceEstimateResult,
  PriceFreshnessStatus,
} from '@/types/food';
import {
  roundMoney,
  calculateNormalizedPriceSafe,
  calculatePortionCostSafe,
} from './money';
import {
  PRICE_CONFIG,
  PRICE_ENGINE_VERSION,
  PriceSourceLevel,
} from './pricing-config';

export function calculateNormalizedPrice(
  packageSizeG: number,
  packagePrice: number
): { price_per_kg: number; price_per_100g: number } {
  return calculateNormalizedPriceSafe(packageSizeG, packagePrice);
}

export function calculatePortionCost(
  pricePerKg: number | null,
  portionGrams: number
): number | null {
  return calculatePortionCostSafe(pricePerKg, portionGrams);
}

/**
 * Classifica a frescura temporal de uma observação de preço em relação a uma data de referência.
 */
export function classifyPriceFreshness(
  observationDateIso: string,
  referenceDateIso: string = new Date().toISOString()
): { freshness: PriceFreshnessStatus; age_days: number } {
  const obsTime = new Date(observationDateIso).getTime();
  const refTime = new Date(referenceDateIso).getTime();

  if (obsTime > refTime) {
    return { freshness: 'unknown', age_days: -1 };
  }

  const diffMs = Math.max(0, refTime - obsTime);
  const ageDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (ageDays <= PRICE_CONFIG.THRESHOLDS.FRESH_DAYS) {
    return { freshness: 'fresh', age_days: ageDays };
  }
  if (ageDays <= PRICE_CONFIG.THRESHOLDS.AGING_DAYS) {
    return { freshness: 'aging', age_days: ageDays };
  }
  return { freshness: 'stale', age_days: ageDays };
}

/**
 * Retorna a estimativa de preço determinística para um alimento com base em observações de mercado.
 *
 * Regras Estritas de Governança Econômica (Auditoria Etapa 5):
 * 1. Isolamento Cambial (Sem FX Engine):
 *    - Observações em BRL somente com BRL; USD somente com USD.
 *    - Nunca misturar moedas. Se moedas divergirem ou não houver dados na moeda alvo, retornar unknown.
 * 2. Isolamento Geográfico:
 *    - Se não houver observações no target country, NUNCA usar observações de outros países.
 * 3. Rejeição de Datas Futuras:
 *    - Observações com observed_at no futuro são descartadas como inválidas.
 * 4. Hierarquia Temporal Determinística:
 *    - city recent (<= 90 dias)
 *    -> state recent (<= 90 dias)
 *    -> national recent (<= 90 dias)
 *    -> fallback stale (cidade/estado/nacional antigos, com frescor 'stale' e confiança reduzida)
 *    -> unknown.
 */
export function getFoodPriceEstimate(
  foodId: string,
  observations: FoodPriceObservation[],
  targetLocation?: { country?: string; state_region?: string; city?: string },
  referenceDateIso: string = new Date().toISOString(),
  targetCurrency: string = PRICE_CONFIG.DEFAULT_CURRENCY
): PriceEstimateResult {
  const refTime = new Date(referenceDateIso).getTime();
  const targetCountry = targetLocation?.country || 'BRA';
  const targetState = targetLocation?.state_region?.toUpperCase().trim();
  const targetCity = targetLocation?.city?.toLowerCase().trim();

  // Filtragem inicial de integridade: alimento, preço positivo, moeda alvo e data não futura
  const validObs = (observations || []).filter((o) => {
    if (o.food_id !== foodId || o.price_per_kg <= 0) return false;
    if (o.currency !== targetCurrency) return false;

    const obsTime = new Date(o.observed_at).getTime();
    if (Number.isNaN(obsTime) || obsTime > refTime) return false; // Rejeitar data no futuro
    return true;
  });

  const emptyResult: PriceEstimateResult = {
    food_id: foodId,
    estimated_price: null,
    estimated_price_per_kg: null,
    estimated_price_per_100g: null,
    currency: targetCurrency,
    confidence: 0,
    price_confidence: 0,
    source_level: 'unknown',
    price_source_level: 'unknown',
    observation_count: 0,
    sample_count: 0,
    price_age_days: null,
    freshness: 'unknown',
    oldest_observation_at: null,
    newest_observation_at: null,
    price_engine_version: PRICE_ENGINE_VERSION,
  };

  if (validObs.length === 0) {
    return emptyResult;
  }

  // Filtrar estritamente pelo país alvo - NUNCA misturar países
  const countryObs = validObs.filter((o) => o.country === targetCountry);
  if (countryObs.length === 0) {
    return emptyResult;
  }

  // Separar em recentes (fresh/aging <= 90 dias) e antigas (stale > 90 dias)
  const isRecentObs = (o: FoodPriceObservation) => {
    const { freshness } = classifyPriceFreshness(o.observed_at, referenceDateIso);
    return freshness === 'fresh' || freshness === 'aging';
  };

  let matchedObs: FoodPriceObservation[] = [];
  let sourceLevel: PriceSourceLevel = 'unknown';

  // 1. Resolução RECENTE (Prioridade temporal estrita)
  // 1.1. Cidade Recente
  if (targetCity && targetState) {
    const cityRecent = countryObs.filter(
      (o) =>
        o.state_region?.toUpperCase().trim() === targetState &&
        o.city?.toLowerCase().trim() === targetCity &&
        isRecentObs(o)
    );
    if (cityRecent.length > 0) {
      matchedObs = cityRecent;
      sourceLevel = 'city';
    }
  }

  // 1.2. Estado Recente (vence cidade stale quando a cidade só tem dados antigos)
  if (matchedObs.length === 0 && targetState) {
    const stateRecent = countryObs.filter(
      (o) =>
        o.state_region?.toUpperCase().trim() === targetState &&
        isRecentObs(o)
    );
    if (stateRecent.length > 0) {
      matchedObs = stateRecent;
      sourceLevel = 'state';
    }
  }

  // 1.3. Nacional Recente
  if (matchedObs.length === 0) {
    const nationalRecent = countryObs.filter((o) => isRecentObs(o));
    if (nationalRecent.length > 0) {
      matchedObs = nationalRecent;
      sourceLevel = 'national';
    }
  }

  // 2. FALLBACK STALE (Somente quando não houver nenhuma observação recente no país)
  if (matchedObs.length === 0) {
    // 2.1. Cidade Stale
    if (targetCity && targetState) {
      const cityStale = countryObs.filter(
        (o) =>
          o.state_region?.toUpperCase().trim() === targetState &&
          o.city?.toLowerCase().trim() === targetCity
      );
      if (cityStale.length > 0) {
        matchedObs = cityStale;
        sourceLevel = 'city';
      }
    }

    // 2.2. Estado Stale
    if (matchedObs.length === 0 && targetState) {
      const stateStale = countryObs.filter(
        (o) => o.state_region?.toUpperCase().trim() === targetState
      );
      if (stateStale.length > 0) {
        matchedObs = stateStale;
        sourceLevel = 'state';
      }
    }

    // 2.3. Nacional Stale
    if (matchedObs.length === 0) {
      matchedObs = countryObs;
      sourceLevel = 'national';
    }
  }

  if (matchedObs.length === 0) {
    return emptyResult;
  }

  const levelConfidenceMultiplier = PRICE_CONFIG.LEVEL_WEIGHTS[sourceLevel] ?? 0.0;

  // Cálculo seguro da média ponderada sem drift
  const sumPricePerKg = matchedObs.reduce((acc, o) => acc + o.price_per_kg, 0);
  const avgPricePerKg = roundMoney(sumPricePerKg / matchedObs.length, 2);
  const avgPricePer100g = roundMoney(avgPricePerKg / 10, 2);

  // Ordenação de datas
  const sortedDates = matchedObs
    .map((o) => o.observed_at)
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
  const newestDateIso = sortedDates[0];
  const oldestDateIso = sortedDates[sortedDates.length - 1];
  const { freshness, age_days } = classifyPriceFreshness(newestDateIso, referenceDateIso);

  // Fator de frescor na confiança
  const freshnessFactor = PRICE_CONFIG.FRESHNESS_WEIGHTS[freshness] ?? 0.5;
  const baseConfidence =
    matchedObs.reduce((acc, o) => acc + (o.confidence || 1.0), 0) / matchedObs.length;
  const finalConfidence = roundMoney(baseConfidence * levelConfidenceMultiplier * freshnessFactor, 2);

  return {
    food_id: foodId,
    estimated_price: avgPricePerKg,
    estimated_price_per_kg: avgPricePerKg,
    estimated_price_per_100g: avgPricePer100g,
    currency: targetCurrency,
    confidence: finalConfidence,
    price_confidence: finalConfidence,
    source_level: sourceLevel,
    price_source_level: sourceLevel,
    observation_count: matchedObs.length,
    sample_count: matchedObs.length,
    price_age_days: age_days,
    freshness,
    oldest_observation_at: oldestDateIso,
    newest_observation_at: newestDateIso,
    price_engine_version: PRICE_ENGINE_VERSION,
  };
}

/**
 * Calcula métricas de eficiência econômico-nutricionais determinísticas:
 * - Custo por 100g
 * - Custo por 100 kcal
 * - Custo por 10g de proteína
 */
export function calculateEconomicNutritionalMetrics(
  foodId: string,
  pricePerKg: number | null,
  energyKcalPer100g: number | null,
  proteinGPer100g: number | null,
  currency: string = PRICE_CONFIG.DEFAULT_CURRENCY
): FoodEconomicNutritionalMetrics {
  if (pricePerKg === null || pricePerKg <= 0) {
    return {
      food_id: foodId,
      price_per_kg: null,
      cost_per_100g: null,
      cost_per_100_kcal: null,
      cost_per_10g_protein: null,
      currency,
    };
  }

  const costPer100g = roundMoney(pricePerKg / 10, 2);

  let costPer100Kcal: number | null = null;
  if (energyKcalPer100g && energyKcalPer100g > 0) {
    costPer100Kcal = roundMoney((costPer100g / energyKcalPer100g) * 100, 2);
  }

  let costPer10gProtein: number | null = null;
  if (proteinGPer100g && proteinGPer100g > 0) {
    costPer10gProtein = roundMoney((costPer100g / proteinGPer100g) * 10, 2);
  }

  return {
    food_id: foodId,
    price_per_kg: pricePerKg,
    cost_per_100g: costPer100g,
    cost_per_100_kcal: costPer100Kcal,
    cost_per_10g_protein: costPer10gProtein,
    currency,
  };
}
