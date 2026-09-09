/**
 * Configuração Central e Versionada do Motor Nutricional Determinístico.
 * Nenhuma fórmula ou regra clínica deve residir na UI ou em componentes React.
 */

export const ENGINE_VERSION = 'nutrition-engine-1.1.0';
export const CONFIG_VERSION = 'config-1.1.0';

export const BMR_FORMULA_NAME = 'mifflin_st_jeor' as const;
export const BMR_FORMULA_VERSION = '1.0.0';

/**
 * Fatores padronizados para o cálculo do TDEE (Total Daily Energy Expenditure).
 * Nenhum valor desconhecido recebe fallback silencioso.
 */
export const ACTIVITY_FACTORS: Record<string, number> = {
  sedentary: 1.20,
  light: 1.375,
  moderate: 1.55,
  high: 1.725,
  very_high: 1.90,
};

export const VALID_ACTIVITY_LEVELS = Object.keys(ACTIVITY_FACTORS);

/**
 * Ajustes calóricos nominais (kcal/dia) por objetivo e ritmo de variação desejado.
 * Trabalha em conjunto com limites percentuais relativos ao TDEE.
 */
export const GOAL_CALORIC_ADJUSTMENTS: Record<string, Record<string, number>> = {
  lose_weight: {
    slow: -300,
    moderate: -500,
    fast: -750,
  },
  gain_muscle: {
    slow: 200,
    moderate: 350,
    fast: 500,
  },
  maintain_weight: {
    slow: 0,
    moderate: 0,
    fast: 0,
  },
  body_recomposition: {
    slow: -150,
    moderate: -250,
    fast: -350,
  },
  improve_health: {
    slow: 0,
    moderate: 0,
    fast: 0,
  },
  improve_performance: {
    slow: 100,
    moderate: 200,
    fast: 300,
  },
};

/**
 * Guardrails operacionais versionados do motor nutricional.
 * ATENÇÃO: Não representam verdades clínicas universais nem limites médicos absolutos.
 * Se o cálculo nominal atingir ou for limitado por qualquer guardrail, o motor
 * registra target_was_clamped = true, clamp_reason e exige validação profissional.
 */
export const ENGINE_OPERATIONAL_GUARDRAILS = {
  MIN_CALORIES_FEMALE: 1200,
  MIN_CALORIES_MALE: 1500,
  MAX_CALORIES_SAFE_CEILING: 4500,
  TARGET_RANGE_HALF_WIDTH_KCAL: 100,
  // Limites relativos operacionais versionados da engine em relação ao TDEE (não limites clínicos universais)
  MAX_ENGINE_DEFICIT_PERCENTAGE_TDEE: 0.25, // Déficit > 25% do TDEE exige revisão profissional
  MAX_ENGINE_SURPLUS_PERCENTAGE_TDEE: 0.20, // Superávit > 20% do TDEE exige revisão profissional
};

/**
 * Limites e patamares de triagem clínica e estratificação de peso.
 */
export const SAFETY_BOUNDS = {
  MIN_ADULT_AGE: 18,
  MAX_ADULT_AGE: 110,
  BMI_MIN_OUTLIER: 16.0,
  BMI_MAX_OUTLIER: 45.0,
  BMI_OBESITY_THRESHOLD: 30.0,
  BMI_SEVERE_OBESITY_THRESHOLD: 40.0,
  BMI_IDEAL_CEILING: 24.9,
  OBESITY_EXCESS_WEIGHT_FACTOR: 0.25, // Fórmula de Wilkens / peso ajustado
};

/**
 * Fatores de conversão energética e regras de distribuição de macronutrientes.
 */
export const MACRO_CONFIG = {
  CALORIES_PER_G_PROTEIN: 4,
  CALORIES_PER_G_CARBOHYDRATE: 4,
  CALORIES_PER_G_FAT: 9,

  // Proteína recomendada em g/kg de peso de referência por objetivo
  PROTEIN_G_PER_KG_BY_GOAL: {
    lose_weight: 2.0,
    gain_muscle: 2.0,
    body_recomposition: 2.2,
    improve_performance: 1.8,
    maintain_weight: 1.5,
    improve_health: 1.4,
  } as Record<string, number>,

  DEFAULT_FAT_PERCENTAGE: 0.25,
  MIN_FAT_G_PER_KG: 0.6,
  MIN_ESSENTIAL_PROTEIN_G_PER_KG: 1.2,

  // Tolerância de conservação energética estrita
  ENERGY_CONSERVATION_TOLERANCE_KCAL: 3.0,
};
