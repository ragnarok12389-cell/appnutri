import crypto from 'crypto';
import { PatientNutritionProfile, PatientNutritionSensitive } from '@/types/nutrition-profile';
import {
  ENGINE_VERSION,
  CONFIG_VERSION,
  BMR_FORMULA_VERSION,
  ACTIVITY_FACTORS,
  ENGINE_OPERATIONAL_GUARDRAILS,
  MACRO_CONFIG,
} from './config';

/**
 * Serializa deterministicamente qualquer estrutura de dados em JSON canônico
 * com ordenação consistente de chaves em todos os níveis de profundidade.
 */
export function canonicalJsonStringify(obj: unknown): string {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }

  if (Array.isArray(obj)) {
    return '[' + obj.map((item) => canonicalJsonStringify(item)).join(',') + ']';
  }

  const sortedKeys = Object.keys(obj as Record<string, unknown>).sort();
  const pairs = sortedKeys.map((key) => {
    const val = (obj as Record<string, unknown>)[key];
    return JSON.stringify(key) + ':' + canonicalJsonStringify(val);
  });

  return '{' + pairs.join(',') + '}';
}

/**
 * Calcula o hash SHA-256 de um payload canônico.
 */
export function calculateSha256(data: unknown): string {
  const canonicalStr = canonicalJsonStringify(data);
  return crypto.createHash('sha256').update(canonicalStr).digest('hex');
}

export interface EngineInputHashes {
  input_snapshot_hash: string;
  safety_input_hash: string;
  engine_config_hash: string;
  input_hash: string;
}

/**
 * Calcula hashes modulares e auditáveis dos dados estritamente utilizados no cálculo.
 * Texto clínico livre NÃO altera os hashes matemáticos porque o motor determinístico
 * não utiliza texto livre para tomar decisões numéricas.
 */
export function calculateEngineInputHashes(
  snapshot: Partial<PatientNutritionProfile>,
  sensitiveSnapshot?: Partial<PatientNutritionSensitive> | null,
  engineVersion: string = ENGINE_VERSION,
  configVersion: string = CONFIG_VERSION
): EngineInputHashes {
  // 1. Snapshot Fisiológico e de Estilo de Vida (apenas campos estruturados utilizados)
  const structuredSnapshot = {
    height_cm: snapshot.height_cm ?? null,
    current_weight_kg: snapshot.current_weight_kg ?? null,
    target_weight_kg: snapshot.target_weight_kg ?? null,
    birth_date: snapshot.birth_date ?? null,
    biological_sex: snapshot.biological_sex ?? null,
    activity_level: snapshot.activity_level ?? null,
    primary_goal: snapshot.primary_goal ?? null,
    desired_rate_of_change: snapshot.desired_rate_of_change ?? null,
    desired_meals_per_day: snapshot.desired_meals_per_day ?? null,
    food_budget_amount: snapshot.food_budget_amount ?? null,
    food_budget_period: snapshot.food_budget_period ?? null,
    is_budget_exclusive_for_patient: snapshot.is_budget_exclusive_for_patient ?? true,
    number_of_people_in_household: snapshot.number_of_people_in_household ?? 1,
    currency: snapshot.currency ?? 'BRL',
    dietary_pattern: snapshot.dietary_pattern ?? 'omnivore',
  };
  const input_snapshot_hash = calculateSha256(structuredSnapshot);

  // 2. Flags Clínicas Estruturadas de Segurança (sem parsing de texto livre)
  const structuredSafety = {
    is_pregnant: Boolean(sensitiveSnapshot?.is_pregnant),
    is_breastfeeding: Boolean(sensitiveSnapshot?.is_breastfeeding),
    has_eating_disorder_history: Boolean(sensitiveSnapshot?.has_eating_disorder_history),
    has_severe_allergies: Boolean(sensitiveSnapshot?.has_severe_allergies),
    has_reported_clinical_condition: Boolean(sensitiveSnapshot?.has_reported_clinical_condition),
    clinical_dietary_restrictions: sensitiveSnapshot?.clinical_dietary_restrictions || [],
    food_allergies: sensitiveSnapshot?.food_allergies || [],
    food_intolerances: sensitiveSnapshot?.food_intolerances || [],
  };
  const safety_input_hash = calculateSha256(structuredSafety);

  // 3. Configurações Versionadas do Motor
  const structuredConfig = {
    engine_version: engineVersion,
    config_version: configVersion,
    bmr_formula_version: BMR_FORMULA_VERSION,
    activity_factors: ACTIVITY_FACTORS,
    operational_guardrails: ENGINE_OPERATIONAL_GUARDRAILS,
    macro_config: MACRO_CONFIG,
  };
  const engine_config_hash = calculateSha256(structuredConfig);

  // 4. Hash Composto de Entrada
  const input_hash = calculateSha256({
    input_snapshot_hash,
    safety_input_hash,
    engine_config_hash,
  });

  return {
    input_snapshot_hash,
    safety_input_hash,
    engine_config_hash,
    input_hash,
  };
}
