import { MACRO_CONFIG, SAFETY_BOUNDS } from '../config';
import {
  MacroReferenceWeightStrategy,
  ScreeningReasonCode,
} from '@/types/nutrition-engine';

export interface MacroDistributionResult {
  protein_g: number;
  carbohydrate_g: number;
  fat_g: number;
  protein_kcal: number;
  carbohydrate_kcal: number;
  fat_kcal: number;
  protein_percentage: number;
  carbohydrate_percentage: number;
  fat_percentage: number;
  energy_conservation_delta_kcal: number;
  macro_reference_weight_kg: number;
  macro_reference_weight_strategy: MacroReferenceWeightStrategy;
  requires_professional_review: boolean;
  review_reason_codes: ScreeningReasonCode[];
}

/**
 * Calcula a distribuição determinística de macronutrientes com invariantes rigorosos.
 * Implementa estratégia explícita de peso de referência (macro_reference_weight_strategy).
 *
 * DOCUMENTAÇÃO DE GOVERNANÇA E AUDITORIA CLÍNICA:
 * A estratégia `adjusted_weight` (baseada na fórmula de Wilkens: P_ajustado = P_ideal + 0.25*(P_atual - P_ideal))
 * é uma heurística operacional versionada da Engine 1.0 para mitigar superdosagem tóxica de proteína e
 * excesso calórico em pacientes com obesidade (IMC >= 30) no cálculo determinístico padrão, e NÃO uma
 * regra clínica universal nem prescrição médica absoluta.
 *
 * Casos antropométricos fora da faixa validada pelo algoritmo automatizado (IMC < 16 ou IMC >= 40)
 * são mantidos estritamente sob `requires_professional_review = true` com o reason code
 * 'EXTREME_BMI_REQUIRES_CLINICAL_REVIEW' para conduta clínica individualizada pelo nutricionista.
 */
export function calculateMacronutrients(
  target_calories_nominal: number,
  current_weight_kg: number,
  height_cm: number,
  primary_goal: string
): MacroDistributionResult {
  if (target_calories_nominal <= 0 || current_weight_kg <= 0 || height_cm <= 0) {
    throw new Error(
      'Calorias nominais, peso e altura devem ser valores positivos para o cálculo de macronutrientes.'
    );
  }

  const heightM = height_cm / 100;
  const bmi = current_weight_kg / (heightM * heightM);

  const reasonCodes: ScreeningReasonCode[] = [];
  let requiresReview = false;

  // 1. Determinação da Estratégia de Peso de Referência
  let strategy: MacroReferenceWeightStrategy = 'actual_weight';
  let referenceWeightKg = current_weight_kg;

  if (bmi >= SAFETY_BOUNDS.BMI_OBESITY_THRESHOLD) {
    // Obesidade (IMC >= 30): Heurística operacional versionada da Engine 1.0 (Fórmula de Wilkens).
    // Peso Ajustado = Peso Ideal + 0.25 * (Peso Atual - Peso Ideal).
    // Não representa regra clínica universal; serve como guardrail determinístico de macronutrientes.
    const idealWeightKg = SAFETY_BOUNDS.BMI_IDEAL_CEILING * (heightM * heightM);
    const adjustedWeightKg =
      idealWeightKg + SAFETY_BOUNDS.OBESITY_EXCESS_WEIGHT_FACTOR * (current_weight_kg - idealWeightKg);

    referenceWeightKg = Math.round(adjustedWeightKg * 10) / 10;
    strategy = 'adjusted_weight';
    reasonCodes.push('OBESITY_ADJUSTED_MACRO_WEIGHT');

    if (bmi >= SAFETY_BOUNDS.BMI_SEVERE_OBESITY_THRESHOLD) {
      requiresReview = true;
      reasonCodes.push('EXTREME_BMI_REQUIRES_CLINICAL_REVIEW');
    }
  } else if (bmi < SAFETY_BOUNDS.BMI_MIN_OUTLIER) {
    // Casos antropométricos com IMC < 16 (desnutrição severa) ficam fora da faixa automatizada
    requiresReview = true;
    reasonCodes.push('EXTREME_BMI_REQUIRES_CLINICAL_REVIEW');
  }

  // 2. Verificação de Invariantes Mínimos Essenciais
  const minProteinG = Math.round(referenceWeightKg * MACRO_CONFIG.MIN_ESSENTIAL_PROTEIN_G_PER_KG * 10) / 10;
  const minFatG = Math.round(referenceWeightKg * MACRO_CONFIG.MIN_FAT_G_PER_KG * 10) / 10;
  const minEssentialKcal =
    minProteinG * MACRO_CONFIG.CALORIES_PER_G_PROTEIN + minFatG * MACRO_CONFIG.CALORIES_PER_G_FAT;

  // Se o orçamento calórico for inferior ao piso mínimo essencial de proteína + gordura:
  // NÃO força carboidrato negativo. NÃO mascara. Exige revisão profissional imediata.
  if (minEssentialKcal > target_calories_nominal) {
    return {
      protein_g: minProteinG,
      carbohydrate_g: 0,
      fat_g: minFatG,
      protein_kcal: minProteinG * MACRO_CONFIG.CALORIES_PER_G_PROTEIN,
      carbohydrate_kcal: 0,
      fat_kcal: minFatG * MACRO_CONFIG.CALORIES_PER_G_FAT,
      protein_percentage: Math.round(((minProteinG * 4) / minEssentialKcal) * 1000) / 10,
      carbohydrate_percentage: 0,
      fat_percentage: Math.round(((minFatG * 9) / minEssentialKcal) * 1000) / 10,
      energy_conservation_delta_kcal: Math.abs(minEssentialKcal - target_calories_nominal),
      macro_reference_weight_kg: referenceWeightKg,
      macro_reference_weight_strategy: strategy,
      requires_professional_review: true,
      review_reason_codes: [...reasonCodes, 'INSUFFICIENT_CALORIES_FOR_ESSENTIAL_MACROS'],
    };
  }

  // 3. Distribuição Nominal de Proteína baseada no Peso de Referência
  const proteinGPerKg =
    MACRO_CONFIG.PROTEIN_G_PER_KG_BY_GOAL[primary_goal] ||
    MACRO_CONFIG.PROTEIN_G_PER_KG_BY_GOAL.maintain_weight;
  let protein_g = Math.round(referenceWeightKg * proteinGPerKg * 10) / 10;
  let protein_kcal = Math.round(protein_g * MACRO_CONFIG.CALORIES_PER_G_PROTEIN * 100) / 100;

  // 4. Gordura: 25% do valor nominal com piso de segurança
  const targetFatFromPctG =
    Math.round(
      ((target_calories_nominal * MACRO_CONFIG.DEFAULT_FAT_PERCENTAGE) / MACRO_CONFIG.CALORIES_PER_G_FAT) * 10
    ) / 10;
  let fat_g = Math.max(minFatG, targetFatFromPctG);
  let fat_kcal = Math.round(fat_g * MACRO_CONFIG.CALORIES_PER_G_FAT * 100) / 100;

  // Se proteína + gordura excederem 85% das calorias totais, rebalanceia proporcionalmente
  if (protein_kcal + fat_kcal > target_calories_nominal * 0.85) {
    protein_g = Math.max(
      minProteinG,
      Math.round(((target_calories_nominal * 0.4) / MACRO_CONFIG.CALORIES_PER_G_PROTEIN) * 10) / 10
    );
    protein_kcal = Math.round(protein_g * MACRO_CONFIG.CALORIES_PER_G_PROTEIN * 100) / 100;
    fat_g = Math.max(
      minFatG,
      Math.round(((target_calories_nominal * 0.25) / MACRO_CONFIG.CALORIES_PER_G_FAT) * 10) / 10
    );
    fat_kcal = Math.round(fat_g * MACRO_CONFIG.CALORIES_PER_G_FAT * 100) / 100;
  }

  // 5. Carboidratos: Saldo Restante
  const remainingKcal = target_calories_nominal - protein_kcal - fat_kcal;
  let carbohydrate_g = Math.max(
    0,
    Math.round((remainingKcal / MACRO_CONFIG.CALORIES_PER_G_CARBOHYDRATE) * 10) / 10
  );
  let carbohydrate_kcal =
    Math.round(carbohydrate_g * MACRO_CONFIG.CALORIES_PER_G_CARBOHYDRATE * 100) / 100;

  // 6. Ajuste de Arredondamento Fino para Conservação Energética Estrita
  const totalFromMacrosKcal = Math.round((protein_kcal + carbohydrate_kcal + fat_kcal) * 100) / 100;
  const delta = Math.round(Math.abs(totalFromMacrosKcal - target_calories_nominal) * 100) / 100;

  if (delta > MACRO_CONFIG.ENERGY_CONSERVATION_TOLERANCE_KCAL && delta <= 15) {
    const adjustmentKcal = target_calories_nominal - totalFromMacrosKcal;
    carbohydrate_g = Math.max(
      0,
      Math.round((carbohydrate_g + adjustmentKcal / MACRO_CONFIG.CALORIES_PER_G_CARBOHYDRATE) * 10) / 10
    );
    carbohydrate_kcal =
      Math.round(carbohydrate_g * MACRO_CONFIG.CALORIES_PER_G_CARBOHYDRATE * 100) / 100;
  }

  // 7. Invariantes Finais Obrigatórios
  const finalSumKcal = protein_kcal + carbohydrate_kcal + fat_kcal;
  if (protein_g < 0 || fat_g < 0 || carbohydrate_g < 0) {
    requiresReview = true;
    reasonCodes.push('INSUFFICIENT_CALORIES_FOR_ESSENTIAL_MACROS');
  }

  const protein_percentage = Math.round((protein_kcal / finalSumKcal) * 1000) / 10;
  const carbohydrate_percentage = Math.round((carbohydrate_kcal / finalSumKcal) * 1000) / 10;
  const fat_percentage = Math.round((fat_kcal / finalSumKcal) * 1000) / 10;

  return {
    protein_g,
    carbohydrate_g,
    fat_g,
    protein_kcal,
    carbohydrate_kcal,
    fat_kcal,
    protein_percentage,
    carbohydrate_percentage,
    fat_percentage,
    energy_conservation_delta_kcal: Math.round(Math.abs(finalSumKcal - target_calories_nominal) * 100) / 100,
    macro_reference_weight_kg: referenceWeightKg,
    macro_reference_weight_strategy: strategy,
    requires_professional_review: requiresReview,
    review_reason_codes: reasonCodes,
  };
}
