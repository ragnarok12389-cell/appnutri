// ==============================================================================
// CANDIDATE FILTER: DETERMINISTIC SELECTION & STRICT TRI-STATE ALLERGEN SAFETY
// ==============================================================================

import { NutritionConstraints } from '@/types/nutrition-engine';
import {
  checkFoodCompatibilityWithConstraints,
  CompatibleFoodData,
} from '@/lib/foods/compatibility';
import { ComposerCandidateFood, FoodRole } from './types';

/**
 * Infere deterministicamente o papel funcional alimentar de um alimento
 * caso não esteja explicitamente configurado no catálogo.
 */
export function inferFoodRole(food: {
  food_group: string;
  energy_kcal_100g: number;
  protein_g_100g: number;
  carbohydrate_g_100g: number;
  fat_g_100g: number;
  categories?: string[];
}): FoodRole {
  const normalize = (value: string) => value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  const fg = normalize(food.food_group || '');
  const cats = (food.categories || []).map(normalize);

  if (cats.includes('protein_source') || cats.includes('meat') || cats.includes('poultry') || cats.includes('fish')) {
    return 'protein';
  }
  if (cats.includes('carb_source') || cats.includes('grain') || cats.includes('tuber')) {
    return 'carb';
  }
  if (cats.includes('vegetable') || cats.includes('salad')) {
    return 'vegetable';
  }
  if (cats.includes('fruit')) {
    return 'fruit';
  }
  if (cats.includes('dairy')) {
    return 'dairy';
  }
  if (cats.includes('lipid') || cats.includes('oil')) {
    return 'lipid';
  }
  if (cats.includes('legume')) {
    return 'legume';
  }

  // Inferência por grupo alimentar TACO
  if (fg.includes('carne') || fg.includes('pescado') || fg.includes('frango') || fg.includes('ovo')) {
    return 'protein';
  }
  if (fg.includes('leite') || fg.includes('laticinio') || fg.includes('queijo') || fg.includes('iogurte')) {
    return 'dairy';
  }
  if (fg.includes('leguminosa')) {
    return 'legume';
  }
  if (fg.includes('cereal') || fg.includes('tuberculo') || fg.includes('raiz') || fg.includes('farinha')) {
    return 'carb';
  }
  if (fg.includes('verdura') || fg.includes('hortalica') || fg.includes('legume')) {
    return 'vegetable';
  }
  if (fg.includes('fruta')) {
    return 'fruit';
  }
  if (fg.includes('oleo') || fg.includes('gordura') || fg.includes('castanha') || fg.includes('nozes')) {
    return 'lipid';
  }

  // Inferência por predominância de macronutrientes
  const protKcal = food.protein_g_100g * 4;
  const carbKcal = food.carbohydrate_g_100g * 4;
  const fatKcal = food.fat_g_100g * 9;
  const totalMacroKcal = Math.max(1, protKcal + carbKcal + fatKcal);

  if (protKcal / totalMacroKcal >= 0.35 && food.protein_g_100g >= 10) {
    return 'protein';
  }
  if (carbKcal / totalMacroKcal >= 0.50 && food.carbohydrate_g_100g >= 15) {
    return 'carb';
  }
  if (fatKcal / totalMacroKcal >= 0.60) {
    return 'lipid';
  }
  if (food.energy_kcal_100g < 50 && food.carbohydrate_g_100g < 10) {
    return 'vegetable';
  }

  return 'other';
}

/**
 * Filtra deterministicamente os alimentos candidatos para a composição da dieta.
 *
 * Regras Estritas:
 * 1. Composição nutricional válida (sem NaN, valores positivos).
 * 2. Tri-state de alergias via checkFoodCompatibilityWithConstraints:
 *    - TRUE -> Excluído sumariamente.
 *    - FALSE -> Permitido.
 *    - UNKNOWN -> EXCLUÍDO DA SELEÇÃO AUTOMÁTICA (UNKNOWN != SAFE).
 * 3. Alimentos recusados e desgostados -> Excluídos.
 * 4. Padrão alimentar (vegano, vegetariano) -> Respeitado estritamente.
 */
export function filterEligibleFoods(
  catalog: ComposerCandidateFood[],
  constraints: NutritionConstraints
): {
  eligibleFoods: ComposerCandidateFood[];
  excludedCount: number;
  blockedCount: number;
  unknownAllergenCount: number;
} {
  const eligibleFoods: ComposerCandidateFood[] = [];
  let blockedCount = 0;
  let unknownAllergenCount = 0;

  for (const food of catalog) {
    // 1. Integridade matemática
    if (
      Number.isNaN(food.energy_kcal_100g) ||
      Number.isNaN(food.protein_g_100g) ||
      Number.isNaN(food.carbohydrate_g_100g) ||
      Number.isNaN(food.fat_g_100g) ||
      food.energy_kcal_100g < 0 ||
      food.protein_g_100g < 0 ||
      food.carbohydrate_g_100g < 0 ||
      food.fat_g_100g < 0
    ) {
      continue;
    }

    // 2. Política v1 para professional_custom: apenas TACO oficial ou custom com validação clínica apropriada
    const isOfficial =
      food.source_type === 'official' ||
      food.source_type === 'official_table' ||
      food.validation_status === 'official_approved' ||
      !food.source_type; // compatibilidade com mocks default TACO
    const isVerifiedCustom =
      (food.source_type === 'professional_custom' || food.source_type === 'custom') &&
      food.validation_status === 'verified_by_nutritionist';

    if (!isOfficial && !isVerifiedCustom) {
      // Custom food em rascunho, rejeitada ou unverified: NUNCA elegível para composição automática
      continue;
    }

    // 3. Avaliação de compatibilidade com restrições e tri-state de alergênicos
    const compatibleData: CompatibleFoodData = {
      id: food.id,
      name: food.name,
      normalized_name: food.normalized_name,
      food_group: food.food_group,
      aliases: food.aliases,
      categories: food.categories,
      tags: food.tags,
    };

    const comp = checkFoodCompatibilityWithConstraints(compatibleData, constraints);

    if (comp.status === 'blocked') {
      blockedCount++;
      continue;
    }

    if (comp.status === 'review_required') {
      // UNKNOWN != SAFE: Alimentos com alergênico incerto NÃO entram na composição automática
      unknownAllergenCount++;
      continue;
    }

    // Alimento 100% elegível e seguro
    const role = !food.role || food.role === 'other' ? inferFoodRole(food) : food.role;
    eligibleFoods.push({
      ...food,
      role,
    });
  }

  // Ordenação determinística para eliminar qualquer dependência de ordem de busca
  eligibleFoods.sort((a, b) => {
    if (a.food_group !== b.food_group) return a.food_group.localeCompare(b.food_group);
    if (a.normalized_name !== b.normalized_name) return a.normalized_name.localeCompare(b.normalized_name);
    return a.id.localeCompare(b.id);
  });

  return {
    eligibleFoods,
    excludedCount: catalog.length - eligibleFoods.length,
    blockedCount,
    unknownAllergenCount,
  };
}
