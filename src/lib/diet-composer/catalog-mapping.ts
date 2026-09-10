export interface CatalogNutrientRow {
  amount_per_100g: number | null;
  nutrients: { code: string } | null;
}

export interface CanonicalFoodNutrients {
  energy_kcal_100g: number;
  protein_g_100g: number;
  carbohydrate_g_100g: number;
  fat_g_100g: number;
  fiber_g_100g: number | null;
  sodium_mg_100g: number | null;
}

/**
 * Converte os códigos canônicos atuais da TACO e mantém aliases históricos
 * apenas para dados legados. Valor ausente não é confundido com zero nos
 * nutrientes opcionais.
 */
export function readCanonicalFoodNutrients(rows: CatalogNutrientRow[]): CanonicalFoodNutrients {
  const values: Record<string, number> = {};
  for (const row of rows) {
    const code = row.nutrients?.code;
    if (code && row.amount_per_100g !== null) values[code] = Number(row.amount_per_100g);
  }

  return {
    energy_kcal_100g: values.energy_kcal ?? 0,
    protein_g_100g: values.protein_g ?? values.protein ?? 0,
    carbohydrate_g_100g: values.carbohydrate_g ?? values.carbohydrate ?? 0,
    fat_g_100g: values.fat_g ?? values.lipids ?? 0,
    fiber_g_100g: values.fiber_g ?? values.dietary_fiber ?? null,
    sodium_mg_100g: values.sodium_mg ?? values.sodium ?? null,
  };
}
