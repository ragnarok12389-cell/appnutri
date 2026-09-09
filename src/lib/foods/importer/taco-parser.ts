/**
 * Parser Determinístico de Dados Nutricionais da TACO 4ª edição.
 *
 * Implementa rigorosamente as convenções da publicação oficial do NEPA/UNICAMP:
 * - "Tr" = TRACE (Traço analítico abaixo do limite de quantificação. numeric_value permanece NULL).
 * - "NA" = NOT_APPLICABLE (Não Aplicável para aquela matriz alimentar. numeric_value permanece NULL).
 * - "*" = UNDER_REEVALUATION (Análise desconsiderada ou sob reavaliação. numeric_value permanece NULL).
 * - "" (blank) = NOT_REQUESTED (Análise não solicitada para aquele grupo. numeric_value permanece NULL).
 * - 0 / 0.0 = KNOWN_NUMERIC_ZERO (Zero analítico comprovado).
 * - número > 0 = NUMERIC_VALUE.
 */

import {
  ValueStatus,
  NutrientDataQuality,
  EnergyConsistencyStatus,
  EngineEligibilityStatus,
} from '@/types/food';

export interface ParsedNutrientValue {
  raw_value: string;
  numeric_value: number | null;
  amount: number | null; // espelho de numeric_value para compatibilidade com engine
  value_status: ValueStatus;
  data_quality: NutrientDataQuality;
}

export interface EnergyConsistencyResult {
  status: EnergyConsistencyStatus;
  estimated_kcal: number | null;
  delta_percentage: number | null;
}

/**
 * Converte valor analítico bruto da TACO em representação estruturada auditável.
 * NÃO inventa valores ausentes e NÃO transforma TRACE em zero numérico.
 */
export function parseTacoNutrientValue(
  rawInput: string | number | null | undefined
): ParsedNutrientValue {
  if (rawInput === null || rawInput === undefined) {
    return {
      raw_value: '',
      numeric_value: null,
      amount: null,
      value_status: 'NOT_REQUESTED',
      data_quality: 'not_requested',
    };
  }

  // Se já for numérico
  if (typeof rawInput === 'number') {
    if (Number.isNaN(rawInput)) {
      return {
        raw_value: '',
        numeric_value: null,
        amount: null,
        value_status: 'NOT_REQUESTED',
        data_quality: 'not_requested',
      };
    }
    if (rawInput < 0) {
      // Número negativo não pode virar KNOWN_NUMERIC_ZERO - classificado como inválido
      return {
        raw_value: String(rawInput),
        numeric_value: null,
        amount: null,
        value_status: 'UNKNOWN',
        data_quality: 'unknown',
      };
    }
    const rounded = Math.round(rawInput * 10000) / 10000;
    if (rounded === 0) {
      return {
        raw_value: String(rawInput),
        numeric_value: 0.0,
        amount: 0.0,
        value_status: 'KNOWN_NUMERIC_ZERO',
        data_quality: 'analytical',
      };
    }
    return {
      raw_value: String(rawInput),
      numeric_value: rounded,
      amount: rounded,
      value_status: 'NUMERIC_VALUE',
      data_quality: 'analytical',
    };
  }

  const str = String(rawInput).trim();

  if (str === '') {
    return {
      raw_value: '',
      numeric_value: null,
      amount: null,
      value_status: 'NOT_REQUESTED',
      data_quality: 'not_requested',
    };
  }

  if (str === 'Tr' || str === 'tr') {
    return {
      raw_value: 'Tr',
      numeric_value: null,
      amount: null,
      value_status: 'TRACE',
      data_quality: 'trace',
    };
  }

  if (str === 'NA' || str === 'na') {
    return {
      raw_value: 'NA',
      numeric_value: null,
      amount: null,
      value_status: 'NOT_APPLICABLE',
      data_quality: 'not_applicable',
    };
  }

  if (str === '*') {
    return {
      raw_value: '*',
      numeric_value: null,
      amount: null,
      value_status: 'UNDER_REEVALUATION',
      data_quality: 'under_reevaluation',
    };
  }

  // Rejeição explícita de números negativos em string
  if (/^-\d/.test(str)) {
    return {
      raw_value: str,
      numeric_value: null,
      amount: null,
      value_status: 'UNKNOWN',
      data_quality: 'unknown',
    };
  }

  // Normalização determinística de decimais
  let normalizedStr = str;
  if (normalizedStr === ',0,02') {
    normalizedStr = '0.02';
  } else if (normalizedStr.startsWith(',') || normalizedStr.startsWith('.')) {
    normalizedStr = '0.' + normalizedStr.slice(1);
  } else {
    normalizedStr = normalizedStr.replace(',', '.');
  }

  // Validação estrita: rejeita strings com sufixos ou caracteres inválidos (ex: "12abc")
  if (!/^\d+(\.\d+)?$/.test(normalizedStr)) {
    return {
      raw_value: str,
      numeric_value: null,
      amount: null,
      value_status: 'UNKNOWN',
      data_quality: 'unknown',
    };
  }

  const parsed = Number(normalizedStr);

  if (Number.isNaN(parsed)) {
    return {
      raw_value: str,
      numeric_value: null,
      amount: null,
      value_status: 'UNKNOWN',
      data_quality: 'unknown',
    };
  }

  const rounded = Math.round(parsed * 10000) / 10000;

  if (rounded === 0) {
    return {
      raw_value: str,
      numeric_value: 0.0,
      amount: 0.0,
      value_status: 'KNOWN_NUMERIC_ZERO',
      data_quality: 'analytical',
    };
  }

  return {
    raw_value: str,
    numeric_value: rounded,
    amount: rounded,
    value_status: 'NUMERIC_VALUE',
    data_quality: 'analytical',
  };
}

/**
 * Política matemática versionada e separada para aproximação de TRACE em cálculos
 * matemáticos quando estritamente necessário pelo motor determinístico.
 * O dado original da fonte permanece inalterado como TRACE e numeric_value = NULL.
 */
export const TRACE_APPROXIMATION_CONFIG_VERSION = '1.0.0';

export function approximateTraceForCalculation(
  _nutrientCode: string,
  configVersion: string = TRACE_APPROXIMATION_CONFIG_VERSION
): number {
  if (configVersion === TRACE_APPROXIMATION_CONFIG_VERSION) {
    // Na política 1.0.0, aproxima-se traço como 0.0 determinístico
    return 0.0;
  }
  return 0.0;
}

/**
 * Validação determinística de consistência entre a energia declarada pelo laboratório
 * e a soma teórica dos macronutrientes pelos fatores de Atwater (4P + 4C + 9G).
 *
 * O valor original da TACO NUNCA é sobrescrito. Apenas o status é classificado.
 */
export function validateEnergyConsistency(
  energyKcal: number | null,
  proteinG: number | null,
  carbsG: number | null,
  fatG: number | null
): EnergyConsistencyResult {
  if (energyKcal === null || proteinG === null || carbsG === null || fatG === null) {
    return {
      status: 'insufficient_data',
      estimated_kcal: null,
      delta_percentage: null,
    };
  }

  // Fatores de Atwater padrão: 4 kcal/g proteína, 4 kcal/g carboidrato, 9 kcal/g lipídios
  const estimatedKcal = Math.round((4 * proteinG + 4 * carbsG + 9 * fatG) * 10) / 10;

  if (energyKcal === 0 && estimatedKcal === 0) {
    return {
      status: 'consistent',
      estimated_kcal: 0,
      delta_percentage: 0,
    };
  }

  if (energyKcal === 0 && estimatedKcal > 0) {
    return {
      status: 'different_from_macro_estimate',
      estimated_kcal: estimatedKcal,
      delta_percentage: 100,
    };
  }

  const delta = Math.abs(energyKcal - estimatedKcal);
  const deltaPercentage = Math.round((delta / energyKcal) * 1000) / 10;

  let status: EnergyConsistencyStatus;
  if (deltaPercentage <= 10.0) {
    status = 'consistent';
  } else if (deltaPercentage <= 20.0) {
    // Variações de até 20% são comuns devido a fibras alimentares, cinzas e métodos analíticos
    status = 'within_tolerance';
  } else {
    status = 'different_from_macro_estimate';
  }

  return {
    status,
    estimated_kcal: estimatedKcal,
    delta_percentage: deltaPercentage,
  };
}

/**
 * Avalia se o alimento possui todos os macronutrientes obrigatórios
 * para ser considerado elegível para o motor automático de composição.
 */
export function determineEngineEligibility(nutrients: {
  energy_kcal?: number | null;
  protein_g?: number | null;
  carbohydrate_g?: number | null;
  fat_g?: number | null;
}): EngineEligibilityStatus {
  if (
    nutrients.energy_kcal === null ||
    nutrients.energy_kcal === undefined ||
    nutrients.protein_g === null ||
    nutrients.protein_g === undefined ||
    nutrients.carbohydrate_g === null ||
    nutrients.carbohydrate_g === undefined ||
    nutrients.fat_g === null ||
    nutrients.fat_g === undefined
  ) {
    return 'incomplete_nutrition';
  }

  return 'eligible_for_engine';
}

/**
 * Normaliza strings para indexação de busca textual sem acentos.
 */
export function normalizeFoodText(text: string): string {
  if (!text) return '';
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
