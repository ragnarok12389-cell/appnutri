import { calculateSha256 } from '@/lib/nutrition-engine/hash';
import {
  parseTacoNutrientValue,
  validateEnergyConsistency,
  determineEngineEligibility,
  normalizeFoodText,
} from './taco-parser';
import tacoFixtureDataset from '@/data/taco/taco_4_edicao.json';
import tacoCompleteDataset from '@/data/taco/taco_4_edicao_complete.json';

export interface ImportResult {
  source_id: string;
  source_name: string;
  source_version: string;
  checksum: string;
  foods_count: number;
  nutrients_catalog_count: number;
  food_nutrients_count: number;
  measures_count: number;
  aliases_count: number;
  categories_count: number;
  tags_count: number;
  errors: string[];
}

export interface NormalizedNutrientEntry {
  raw_value: string;
  numeric_value: number | null;
  amount: number | null;
  value_status: string;
  data_quality: string;
  source_reference?: string;
}

export interface NormalizedFoodRecord {
  source_food_code: string;
  name: string;
  normalized_name: string;
  scientific_name: string | null;
  food_group: string;
  preparation_state: 'raw' | 'cooked' | 'grilled' | 'roasted' | 'fried' | 'prepared' | 'industrialized' | 'other';
  is_generic: boolean;
  engine_eligibility_status: 'eligible_for_engine' | 'needs_review' | 'incomplete_nutrition' | 'disabled';
  energy_consistency_status: 'consistent' | 'within_tolerance' | 'different_from_macro_estimate' | 'insufficient_data';
  nutrients: Record<string, NormalizedNutrientEntry>;
  household_measures: Array<{ label: string; grams: number; source: string; is_estimated: boolean }>;
  aliases: string[];
  categories: string[];
  tags: Record<string, 'true' | 'false' | 'unknown'>;
}

export const TACO_OFFICIAL_26_NUTRIENTS = [
  { code: 'moisture_pct', name: 'Umidade', unit: '%', category: 'other', display_order: 1 },
  { code: 'energy_kcal', name: 'Energia', unit: 'kcal', category: 'macro', display_order: 2 },
  { code: 'energy_kj', name: 'Energia', unit: 'kJ', category: 'macro', display_order: 3 },
  { code: 'protein_g', name: 'Proteína', unit: 'g', category: 'macro', display_order: 4 },
  { code: 'fat_g', name: 'Lipídeos', unit: 'g', category: 'macro', display_order: 5 },
  { code: 'cholesterol_mg', name: 'Colesterol', unit: 'mg', category: 'lipid', display_order: 6 },
  { code: 'carbohydrate_g', name: 'Carboidrato total', unit: 'g', category: 'macro', display_order: 7 },
  { code: 'fiber_g', name: 'Fibra alimentar', unit: 'g', category: 'macro', display_order: 8 },
  { code: 'ash_g', name: 'Cinzas', unit: 'g', category: 'other', display_order: 9 },
  { code: 'calcium_mg', name: 'Cálcio', unit: 'mg', category: 'mineral', display_order: 10 },
  { code: 'magnesium_mg', name: 'Magnésio', unit: 'mg', category: 'mineral', display_order: 11 },
  { code: 'manganese_mg', name: 'Manganês', unit: 'mg', category: 'mineral', display_order: 12 },
  { code: 'phosphorus_mg', name: 'Fósforo', unit: 'mg', category: 'mineral', display_order: 13 },
  { code: 'iron_mg', name: 'Ferro', unit: 'mg', category: 'mineral', display_order: 14 },
  { code: 'sodium_mg', name: 'Sódio', unit: 'mg', category: 'mineral', display_order: 15 },
  { code: 'potassium_mg', name: 'Potássio', unit: 'mg', category: 'mineral', display_order: 16 },
  { code: 'copper_mg', name: 'Cobre', unit: 'mg', category: 'mineral', display_order: 17 },
  { code: 'zinc_mg', name: 'Zinco', unit: 'mg', category: 'mineral', display_order: 18 },
  { code: 'retinol_mcg', name: 'Retinol', unit: 'mcg', category: 'vitamin', display_order: 19 },
  { code: 're_mcg', name: 'Equivalente de Retinol (RE)', unit: 'mcg', category: 'vitamin', display_order: 20 },
  { code: 'rae_mcg', name: 'Equivalente de Atividade de Retinol (RAE)', unit: 'mcg', category: 'vitamin', display_order: 21 },
  { code: 'thiamine_mg', name: 'Tiamina', unit: 'mg', category: 'vitamin', display_order: 22 },
  { code: 'riboflavin_mg', name: 'Riboflavina', unit: 'mg', category: 'vitamin', display_order: 23 },
  { code: 'pyridoxine_mg', name: 'Piridoxina', unit: 'mg', category: 'vitamin', display_order: 24 },
  { code: 'niacin_mg', name: 'Niacina', unit: 'mg', category: 'vitamin', display_order: 25 },
  { code: 'vitamin_c_mg', name: 'Vitamina C', unit: 'mg', category: 'vitamin', display_order: 26 },
];

/**
 * Normaliza e valida o dataset canônico da TACO antes da persistência.
 * Suporta o fixture de teste controlado ou o dataset completo oficial de 597 alimentos.
 */
export function parseAndNormalizeTacoDataset(datasetType: 'fixture' | 'official_complete' = 'fixture'): {
  source: {
    name: string;
    version: string;
    publisher: string;
    reference: string;
    domain?: string;
    source_url?: string;
    license_notes?: string;
    source_file?: string;
    source_file_checksum?: string;
  };
  nutrients_catalog: Array<{
    code: string;
    name: string;
    unit: string;
    category: string;
    display_order: number;
  }>;
  foods: NormalizedFoodRecord[];
  checksum: string;
} {
  const isComplete = datasetType === 'official_complete';
  const rawDataset = isComplete ? tacoCompleteDataset : tacoFixtureDataset;
  const jsonString = JSON.stringify(rawDataset);
  const checksum = calculateSha256(jsonString);

  const nutrientsCatalog = isComplete
    ? TACO_OFFICIAL_26_NUTRIENTS
    : (tacoFixtureDataset.nutrients_catalog || []).map((nc, idx) => ({
        code: nc.code,
        name: nc.name,
        unit: nc.unit,
        category: nc.category,
        display_order: idx + 1,
      }));

interface RawNutrientEntry {
  raw_value?: string;
  numeric_value?: number | null;
  value_status?: string;
  data_quality?: string;
  source_reference?: string;
}

interface RawFoodItem {
  source_food_code: string;
  name: string;
  normalized_name?: string;
  scientific_name?: string | null;
  food_group: string;
  preparation_state?: NormalizedFoodRecord['preparation_state'];
  is_generic?: boolean;
  nutrients: Record<string, string | number | null | RawNutrientEntry>;
  household_measures?: Array<{
    label?: string;
    name?: string;
    grams: number;
    source?: string;
    source_reference?: string;
    is_estimated?: boolean;
  }>;
  aliases?: Array<string | { alias: string; alias_type?: string; locale?: string }>;
  categories?: string[];
  tags?: Record<string, 'true' | 'false' | 'unknown'>;
}

  const foods: NormalizedFoodRecord[] = (rawDataset.foods as unknown as RawFoodItem[]).map((rawFood: RawFoodItem) => {
    const parsedNutrients: Record<string, NormalizedNutrientEntry> = {};

    for (const [code, val] of Object.entries(rawFood.nutrients)) {
      if (typeof val === 'object' && val !== null && 'raw_value' in val) {
        // Já está no formato completo da extração
        const entry = val as RawNutrientEntry;
        parsedNutrients[code] = {
          raw_value: String(entry.raw_value ?? ''),
          numeric_value: entry.numeric_value ?? null,
          amount: entry.numeric_value ?? null,
          value_status: String(entry.value_status ?? 'NUMERIC_VALUE'),
          data_quality: String(entry.data_quality ?? 'analytical'),
          source_reference: entry.source_reference,
        };
      } else {
        const parsed = parseTacoNutrientValue(val as string | number | null);
        parsedNutrients[code] = {
          raw_value: parsed.raw_value,
          numeric_value: parsed.numeric_value,
          amount: parsed.amount,
          value_status: parsed.value_status,
          data_quality: parsed.data_quality,
          source_reference: `TACO 4ª edição, ${rawFood.source_food_code}`,
        };
      }
    }

    const energyConsistency = validateEnergyConsistency(
      parsedNutrients.energy_kcal?.numeric_value ?? null,
      parsedNutrients.protein_g?.numeric_value ?? null,
      parsedNutrients.carbohydrate_g?.numeric_value ?? null,
      parsedNutrients.fat_g?.numeric_value ?? null
    );

    const eligibility = determineEngineEligibility({
      energy_kcal: parsedNutrients.energy_kcal?.numeric_value,
      protein_g: parsedNutrients.protein_g?.numeric_value,
      carbohydrate_g: parsedNutrients.carbohydrate_g?.numeric_value,
      fat_g: parsedNutrients.fat_g?.numeric_value,
    });

    const mappedMeasures = (rawFood.household_measures || []).map((m) => ({
      label: m.label || m.name || '',
      grams: m.grams,
      source: m.source || m.source_reference || 'official_source',
      is_estimated: Boolean(m.is_estimated),
    }));

    const mappedAliases = (rawFood.aliases || []).map((a) =>
      typeof a === 'string' ? a : a.alias
    );

    return {
      source_food_code: rawFood.source_food_code,
      name: rawFood.name,
      normalized_name: normalizeFoodText(rawFood.name),
      scientific_name: rawFood.scientific_name || null,
      food_group: rawFood.food_group,
      preparation_state: (rawFood.preparation_state as NormalizedFoodRecord['preparation_state']) || 'raw',
      is_generic: rawFood.is_generic ?? true,
      engine_eligibility_status: eligibility,
      energy_consistency_status: energyConsistency.status,
      nutrients: parsedNutrients,
      household_measures: mappedMeasures,
      aliases: mappedAliases,
      categories: rawFood.categories || [],
      tags: (rawFood.tags || {}) as Record<string, 'true' | 'false' | 'unknown'>,
    };
  });

  return {
    source: rawDataset.source,
    nutrients_catalog: nutrientsCatalog,
    foods,
    checksum,
  };
}

/**
 * Executa a importação oficial da TACO através da rotina transacional atômica no PostgreSQL (RPC).
 * Garante BEGIN -> persistência de fontes, catálogo e todos os 597 alimentos e 15.522 nutrientes -> COMMIT.
 * Qualquer erro dispara ROLLBACK total no banco, não deixando nenhum registro parcial.
 */
export async function runCanonicalTacoImport(options?: {
  allowFixture?: boolean;
  simulateFailureAfterCode?: string;
}): Promise<{
  success: boolean;
  source_id: string;
  imported_foods_count: number;
  total_nutrients_count: number;
  dataset_version: string;
  checksum: string;
}> {
  const isProd = process.env.NODE_ENV === 'production';
  if (isProd && options?.allowFixture) {
    throw new Error('Importação de dataset fixture em ambiente de produção é terminantemente proibida.');
  }

  const datasetType = options?.allowFixture ? 'fixture' : 'official_complete';
  const normalizedData = parseAndNormalizeTacoDataset(datasetType);
  const { createAdminClient } = await import('@/lib/supabase/admin');
  const adminClient = createAdminClient();

  const { data, error } = await adminClient.rpc('import_canonical_taco_atomic', {
    p_payload: {
      source: normalizedData.source,
      nutrients_catalog: normalizedData.nutrients_catalog,
      foods: normalizedData.foods,
    },
    p_simulate_failure_after_code: options?.simulateFailureAfterCode || null,
  });

  if (error || !data) {
    throw new Error(`Falha atômica durante a importação canônica oficial: ${error?.message || 'Sem retorno do banco'}`);
  }

  return data as {
    success: boolean;
    source_id: string;
    imported_foods_count: number;
    total_nutrients_count: number;
    dataset_version: string;
    checksum: string;
  };
}

