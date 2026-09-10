// ==============================================================================
// CONFIG: DETERMINISTIC DIET COMPOSER VERSION, WEIGHTS & OPERATIONAL TOLERANCES
// ==============================================================================

export const DIET_COMPOSER_VERSION = '1.0.1';
export const DIET_COMPOSER_CONFIG_VERSION = 'config-1.0.1';

/**
 * Threshold unificado e canônico de cobertura mínima de preços para verificação de orçamento (Etapa 6).
 */
export const PRICE_COVERAGE_THRESHOLD_PERCENT = 70.0;

/**
 * Tolerâncias operacionais explícitas e versionadas da Engine de Dieta.
 * Estas tolerâncias são heurísticas de engenharia de software para otimização determinística
 * e estão documentadas para posterior validação clínica por nutricionista licenciada.
 * A distribuição por refeição é SOFT heuristic; os NutritionTargets diários permanecem autoritativos.
 */
export const COMPOSER_TOLERANCES = {
  CALORIES: {
    percentage: 7.0, // ±7.0%
    absolute_min_kcal: 100, // Pelo menos ±100 kcal de margem
  },
  PROTEIN: {
    percentage: 7.0, // ±7.0%
    absolute_min_g: 8, // Pelo menos ±8g de margem
  },
  CARBOHYDRATE: {
    percentage: 8.0, // ±8.0%
    absolute_min_g: 15, // Pelo menos ±15g de margem
  },
  FAT: {
    percentage: 8.0, // ±8.0%
    absolute_min_g: 10, // Pelo menos ±10g de margem
  },
} as const;

/**
 * Pesos da função de perda multi-objetivo determinística.
 */
export const COMPOSER_WEIGHTS = {
  CALORIES: 2.0,
  PROTEIN: 3.0,
  CARBOHYDRATE: 1.5,
  FAT: 1.5,
  FAVORITE_BONUS: 0.25,
  PREFERRED_BONUS: 0.15,
  DISLIKED_PENALTY: 0.40, // Penalidade suave para alimentos desgostados (soft preference)
  VARIETY_PENALTY: 0.40,
  COST_PENALTY: 0.20,
} as const;

export interface PortionBoundary {
  minGrams: number;
  maxGrams: number;
  stepGrams: number;
}

/**
 * Heurísticas operacionais de porção em gramas e passos discretos por grupo/categoria.
 * AVISO DE GOVERNANÇA CLÍNICA:
 * Estes limites e passos discretos (como "50g por ovo") são estritamente heurísticas
 * operacionais de engenharia de software versionadas para otimização discreta,
 * nunca devendo ser apresentadas como regras nutricionais universais.
 * A verdade canônica de cálculo do sistema é SEMPRE em gramas.
 */
export const OPERATIONAL_PORTION_HEURISTICS: Record<string, PortionBoundary> = {
  meat_poultry_fish: { minGrams: 70, maxGrams: 250, stepGrams: 10 },
  eggs: { minGrams: 50, maxGrams: 150, stepGrams: 50 }, // Heurística operacional: ~1 a 3 ovos (~50g por unidade padrão)
  dairy_cheese: { minGrams: 30, maxGrams: 100, stepGrams: 10 },
  dairy_liquid_yogurt: { minGrams: 100, maxGrams: 250, stepGrams: 25 },
  plant_protein: { minGrams: 80, maxGrams: 250, stepGrams: 10 },
  grains_cereals: { minGrams: 50, maxGrams: 300, stepGrams: 10 },
  tubers_roots: { minGrams: 60, maxGrams: 250, stepGrams: 10 },
  legumes: { minGrams: 50, maxGrams: 200, stepGrams: 10 },
  vegetables_leafy: { minGrams: 30, maxGrams: 150, stepGrams: 10 },
  vegetables_other: { minGrams: 50, maxGrams: 180, stepGrams: 10 },
  fruits: { minGrams: 60, maxGrams: 220, stepGrams: 10 },
  oils_fats: { minGrams: 5, maxGrams: 25, stepGrams: 5 },
  nuts_seeds: { minGrams: 15, maxGrams: 45, stepGrams: 5 },
  default: { minGrams: 30, maxGrams: 200, stepGrams: 10 },
};

export const PORTION_BOUNDARIES = OPERATIONAL_PORTION_HEURISTICS;

export const COMPOSER_THRESHOLDS = {
  PRICE_COVERAGE_THRESHOLD_PERCENT: PRICE_COVERAGE_THRESHOLD_PERCENT,
  MIN_PRICE_COVERAGE_FOR_BUDGET_PCT: PRICE_COVERAGE_THRESHOLD_PERCENT,
  BUDGET_OVERRUN_TOLERANCE_PCT: 5.0,
  MAX_DAYS_PER_PLAN: 7,
  MIN_DAYS_PER_PLAN: 1,
} as const;
