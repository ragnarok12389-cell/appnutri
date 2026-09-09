'use server';

import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth/session';
import { hasPermission } from '@/lib/auth/roles';
import { logAuditEvent } from '@/lib/audit/logger';
import {
  FoodItem,
  FoodPriceObservation,
  PriceEstimateResult,
} from '@/types/food';
import { normalizeFoodText } from '@/lib/foods/importer/taco-parser';
import { parseAndNormalizeTacoDataset, runCanonicalTacoImport } from '@/lib/foods/importer/import-pipeline';
import {
  calculateNormalizedPrice,
  getFoodPriceEstimate,
} from '@/lib/foods/pricing';

export interface ActionResponse<T = unknown> {
  data?: T;
  error?: string;
  success?: boolean;
}

export interface FoodSearchResult {
  foods: FoodItem[];
  total: number;
  limit: number;
  offset: number;
}

/**
 * Busca paginada de alimentos com filtros determinísticos por nome, grupo e elegibilidade.
 */
export async function searchFoodsAction(params: {
  query?: string;
  foodGroup?: string;
  eligibilityStatus?: string;
  limit?: number;
  offset?: number;
}): Promise<ActionResponse<FoodSearchResult>> {
  const user = await getCurrentUser();
  if (!user) {
    return { error: 'Acesso não autorizado: autenticação requerida.' };
  }

  const limit = Math.min(params.limit || 25, 100);
  const offset = params.offset || 0;

  const supabase = await createClient();

  let queryBuilder = supabase
    .from('foods')
    .select('*', { count: 'exact' })
    .order('name', { ascending: true })
    .range(offset, offset + limit - 1);

  if (params.foodGroup) {
    queryBuilder = queryBuilder.eq('food_group', params.foodGroup);
  }

  if (params.eligibilityStatus) {
    queryBuilder = queryBuilder.eq('engine_eligibility_status', params.eligibilityStatus);
  }

  if (params.query) {
    const normalized = normalizeFoodText(params.query);
    queryBuilder = queryBuilder.ilike('normalized_name', `%${normalized}%`);
  }

  const { data, count, error } = await queryBuilder;

  if (error) {
    return { error: 'Erro ao consultar banco de dados de alimentos.' };
  }

  return {
    success: true,
    data: {
      foods: (data as FoodItem[]) || [],
      total: count || 0,
      limit,
      offset,
    },
  };
}

/**
 * Retorna os dados analíticos completos de um alimento, incluindo nutrientes por 100g,
 * medidas caseiras, tags, aliases e estimativa de preço atualizada.
 */
export async function getFoodDetailsAction(foodId: string): Promise<
  ActionResponse<{
    food: FoodItem;
    priceEstimate: PriceEstimateResult;
  }>
> {
  const user = await getCurrentUser();
  if (!user) {
    return { error: 'Acesso não autorizado.' };
  }

  const supabase = await createClient();

  // 1. Busca alimento
  const { data: food, error: foodError } = await supabase
    .from('foods')
    .select('*')
    .eq('id', foodId)
    .single();

  if (foodError || !food) {
    return { error: 'Alimento não encontrado.' };
  }

  // 2. Busca nutrientes do alimento com metadados do nutriente
  const { data: foodNutrients } = await supabase
    .from('food_nutrients')
    .select('amount_per_100g, data_quality, nutrients(id, code, name, unit, category, display_order)')
    .eq('food_id', foodId);

  const nutrientsMap: FoodItem['nutrients'] = {};
  if (foodNutrients) {
    for (const item of foodNutrients) {
      const n = (item as unknown as { nutrients: { id: string; code: string; name: string; unit: string; category: string } }).nutrients;
      if (n) {
        nutrientsMap[n.code] = {
          nutrient_id: n.id,
          nutrient_code: n.code,
          nutrient_name: n.name,
          unit: n.unit,
          amount_per_100g: item.amount_per_100g !== null ? Number(item.amount_per_100g) : null,
          data_quality: item.data_quality,
        };
      }
    }
  }

  // 3. Busca medidas caseiras
  const { data: measures } = await supabase
    .from('food_household_measures')
    .select('*')
    .eq('food_id', foodId);

  // 4. Busca aliases
  const { data: aliases } = await supabase
    .from('food_aliases')
    .select('alias_name')
    .eq('food_id', foodId);

  // 5. Busca tags
  const { data: tagMappings } = await supabase
    .from('food_tag_mappings')
    .select('value, food_tags(code)')
    .eq('food_id', foodId);

  const tagsMap: Record<string, 'true' | 'false' | 'unknown'> = {};
  if (tagMappings) {
    for (const tm of tagMappings) {
      const tag = (tm as unknown as { food_tags: { code: string }; value: 'true' | 'false' | 'unknown' }).food_tags;
      if (tag) {
        tagsMap[tag.code] = tm.value as 'true' | 'false' | 'unknown';
      }
    }
  }

  // 6. Busca observações de preço para índice
  const { data: priceObs } = await supabase
    .from('food_price_observations')
    .select('*')
    .eq('food_id', foodId);

  const observations = (priceObs as unknown as FoodPriceObservation[]) || [];
  const priceEstimate = getFoodPriceEstimate(foodId, observations);

  const completeFood: FoodItem = {
    ...(food as FoodItem),
    nutrients: nutrientsMap,
    household_measures: (measures as unknown as FoodItem['household_measures']) || [],
    aliases: aliases ? aliases.map((a: { alias_name: string }) => a.alias_name) : [],
    tags: tagsMap,
  };

  return {
    success: true,
    data: {
      food: completeFood,
      priceEstimate,
    },
  };
}

/**
 * Ativa ou desativa um alimento para o motor automático (exclusivo para administradores).
 */
export async function toggleFoodActiveAction(
  foodId: string,
  isActive: boolean
): Promise<ActionResponse<{ success: boolean }>> {
  const user = await getCurrentUser();
  if (!user) {
    return { error: 'Autenticação requerida.' };
  }

  if (!hasPermission(user, 'foods.manage')) {
    return { error: 'Apenas administradores podem gerenciar o status de alimentos.' };
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from('foods')
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq('id', foodId);

  if (error) {
    return { error: 'Falha ao atualizar status do alimento.' };
  }

  await logAuditEvent({
    actorId: user.id,
    action: isActive ? 'food.enabled' : 'food.disabled',
    entityType: 'foods',
    entityId: foodId,
    metadata: { is_active: isActive },
  });

  return { success: true, data: { success: true } };
}

/**
 * Registra uma nova observação de preço para um alimento.
 */
export async function recordPriceObservationAction(params: {
  foodId: string;
  packageSizeG: number;
  packagePrice: number;
  retailer?: string;
  brand?: string;
  country?: string;
  stateRegion?: string;
  city?: string;
  sourceType?: 'manual_admin' | 'professional_input' | 'retailer_api' | 'public_dataset' | 'receipt' | 'user_report' | 'partner_feed';
}): Promise<ActionResponse<{ id: string }>> {
  const user = await getCurrentUser();
  if (!user) {
    return { error: 'Autenticação requerida.' };
  }

  if (!hasPermission(user, 'food_prices.manage')) {
    return { error: 'Você não tem permissão para registrar observações de preço.' };
  }

  const { price_per_kg, price_per_100g } = calculateNormalizedPrice(
    params.packageSizeG,
    params.packagePrice
  );

  const supabase = await createClient();

  const sourceType = params.sourceType || (user.profile.role_id === 'admin' ? 'manual_admin' : 'professional_input');

  const { data, error } = await supabase
    .from('food_price_observations')
    .insert({
      food_id: params.foodId,
      package_size_g: params.packageSizeG,
      package_price: params.packagePrice,
      price_per_kg,
      price_per_100g,
      currency: 'BRL',
      country: params.country || 'BRA',
      state_region: params.stateRegion || null,
      city: params.city || null,
      retailer: params.retailer || null,
      brand: params.brand || null,
      source_type: sourceType,
      confidence: 1.0,
      entered_by: user.id,
    })
    .select('id')
    .single();

  if (error || !data) {
    return { error: 'Falha ao registrar observação de preço.' };
  }

  await logAuditEvent({
    actorId: user.id,
    action: 'food_price.created',
    entityType: 'food_price_observations',
    entityId: data.id,
    metadata: {
      food_id: params.foodId,
      price_per_kg,
      package_price: params.packagePrice,
      package_size_g: params.packageSizeG,
    },
  });

  return { success: true, data: { id: data.id } };
}

/**
 * Pipeline de Importação Canônica da TACO 4ª edição.
 * Exclusivo para administradores que acionam a rotina server-only confiável (service_role).
 * Execução atômica: nenhum erro é silenciado. Qualquer falha aborta a execução e registra FAILED.
 * Em produção, apenas official_complete é permitido.
 */
export async function importTacoDatasetAction(options?: {
  datasetType?: 'fixture' | 'official_complete';
}): Promise<ActionResponse<{
  importedCount: number;
  expectedCount: number;
  nutrientsCount: number;
  measuresCount: number;
}>> {
  const user = await getCurrentUser();
  if (!user) {
    return { error: 'Autenticação requerida.' };
  }

  if (!hasPermission(user, 'foods.manage')) {
    return { error: 'Apenas administradores podem autorizar a importação da base de dados oficial.' };
  }

  const datasetType = options?.datasetType ?? 'official_complete';

  // Em produção, o uso de fixtures de teste é estritamente proibido
  const isProduction = process.env.NODE_ENV === 'production';
  if (isProduction && datasetType === 'fixture') {
    return { error: 'O dataset de fixture é restrito a testes e CI. Em produção, use exclusivamente official_complete.' };
  }

  const normalizedData = parseAndNormalizeTacoDataset(datasetType);
  const expectedFoodCount = normalizedData.foods.length;

  await logAuditEvent({
    actorId: user.id,
    action: 'food_source.import_started',
    entityType: 'food_data_sources',
    entityId: normalizedData.source.name,
    metadata: {
      version: normalizedData.source.version,
      checksum: normalizedData.checksum,
      dataset_type: datasetType,
    },
  });

  try {
    const importRes = await runCanonicalTacoImport({
      allowFixture: datasetType === 'fixture',
    });

    await logAuditEvent({
      actorId: user.id,
      action: 'food_source.import_completed',
      entityType: 'food_data_sources',
      entityId: importRes.source_id,
      metadata: {
        expected_count: expectedFoodCount,
        effective_count: importRes.imported_foods_count,
        nutrients_count: importRes.total_nutrients_count,
        source_name: normalizedData.source.name,
      },
    });

    return {
      success: true,
      data: {
        importedCount: importRes.imported_foods_count,
        expectedCount: expectedFoodCount,
        nutrientsCount: importRes.total_nutrients_count,
        measuresCount: 0,
      },
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    await logAuditEvent({
      actorId: user.id,
      action: 'food_source.import_failed',
      entityType: 'food_data_sources',
      entityId: normalizedData.source.name,
      metadata: {
        error: errorMsg,
        expected_count: expectedFoodCount,
      },
    });

    return {
      success: false,
      error: `Importação oficial falhou e foi cancelada com rollback integral: ${errorMsg}`,
    };
  }
}
