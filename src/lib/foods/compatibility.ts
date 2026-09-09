import { NutritionConstraints } from '@/types/nutrition-engine';
import { StructuredAllergen } from '@/types/food';
import { normalizeFoodText } from './importer/taco-parser';

export type FoodEligibilityStatus = 'allowed' | 'blocked' | 'review_required';

export interface FoodCompatibilityResult {
  status: FoodEligibilityStatus;
  is_compatible: boolean;
  exclusion_reasons: string[];
  safety_warnings: string[];
  blocked_allergens: StructuredAllergen[];
  review_required_allergens: StructuredAllergen[];
  is_disliked?: boolean;
}

export interface CompatibleFoodData {
  id: string;
  name: string;
  normalized_name: string;
  food_group: string;
  aliases?: string[];
  categories?: string[];
  tags?: Record<string, 'true' | 'false' | 'unknown'>;
}

export const STRUCTURED_ALLERGENS_MAP: Record<StructuredAllergen, { tag: string; aliases: string[] }> = {
  gluten: { tag: 'contains_gluten', aliases: ['gluten', 'trigo', 'centeio', 'cevada', 'aveia'] },
  milk: { tag: 'contains_milk', aliases: ['leite', 'lactose', 'caseina', 'soro de leite'] },
  egg: { tag: 'contains_egg', aliases: ['ovo', 'ovos', 'clara', 'gema', 'albumina'] },
  peanut: { tag: 'contains_peanut', aliases: ['amendoim'] },
  soy: { tag: 'contains_soy', aliases: ['soja'] },
  fish: { tag: 'contains_fish', aliases: ['peixe', 'pescado', 'bacalhau', 'salmao', 'atum'] },
  shellfish: { tag: 'contains_shellfish', aliases: ['frutos do mar', 'frutos_do_mar', 'camarao', 'lagosta', 'siri', 'caranguejo', 'marisco', 'ostra'] },
  tree_nuts: { tag: 'contains_tree_nuts', aliases: ['castanha', 'nozes', 'amendoa', 'avela', 'pistache', 'macadamia'] },
};

/**
 * Avalia de forma puramente determinística se um alimento é compatível
 * com o conjunto estruturado de restrições nutricionais (NutritionConstraints) do paciente.
 *
 * Princípio da Segurança Estrita Tri-State para Alergias:
 * - tag TRUE -> BLOCKED
 * - tag FALSE (comprovada por evidência) -> ALLOWED
 * - tag UNKNOWN ou tag AUSENTE -> REVIEW_REQUIRED
 *
 * Alimentos com status REVIEW_REQUIRED não podem ser automaticamente selecionados
 * para pacientes com alergia correspondente.
 */
export function checkFoodCompatibilityWithConstraints(
  food: CompatibleFoodData,
  constraints: NutritionConstraints
): FoodCompatibilityResult {
  const exclusionReasons: string[] = [];
  const safetyWarnings: string[] = [];
  const blockedAllergens: StructuredAllergen[] = [];
  const reviewRequiredAllergens: StructuredAllergen[] = [];

  const tags = food.tags || {};
  const normalizedFoodName = food.normalized_name || normalizeFoodText(food.name);
  const allNames = [normalizedFoodName, ...(food.aliases || []).map(normalizeFoodText)];

  // 1. Verificação de Alergias Declaradas pelo Paciente usando Códigos Estruturados
  const patientAllergiesNorm = (constraints.patient_reported_allergies || []).map(normalizeFoodText);

  for (const [allergenCode, config] of Object.entries(STRUCTURED_ALLERGENS_MAP) as [StructuredAllergen, { tag: string; aliases: string[] }][]) {
    const isPatientAllergic = patientAllergiesNorm.some((patientAllergy) =>
      config.aliases.some((alias) => patientAllergy.includes(alias))
    );

    if (isPatientAllergic) {
      const tagVal = tags[config.tag];

      if (tagVal === 'true') {
        exclusionReasons.push(`ALERGIA_DECLARADA_POSITIVA: ${allergenCode} (${config.tag} = true)`);
        blockedAllergens.push(allergenCode);
      } else if (tagVal === 'false') {
        // Seguro e comprovado para este alergênico específico
      } else {
        // tagVal === 'unknown' ou ausente (undefined)
        safetyWarnings.push(`ALERGIA_RISCO_DESCONHECIDO: ${allergenCode} (${config.tag} não comprovado com evidência segura)`);
        reviewRequiredAllergens.push(allergenCode);
      }
    }
  }

  // 2. Padrão Alimentar Obrigatório (Vegetariano / Vegano) - Informação UNKNOWN não pode ser presumida compatível
  let unconfirmedDietaryPattern = false;
  if (constraints.allowed_dietary_pattern) {
    const pattern = constraints.allowed_dietary_pattern.toLowerCase();

    if (pattern === 'vegan') {
      if (tags.vegan === 'false') {
        exclusionReasons.push('PADRAO_ALIMENTAR_INCOMPATIVEL: Alimento explicitamente não vegano.');
      } else if (tags.vegan !== 'true') {
        // 'unknown' ou ausente: não é presumido compatível quando obrigatório
        safetyWarnings.push('PADRAO_ALIMENTAR_INCERTO: Conformidade vegana desconhecida ou não comprovada.');
        unconfirmedDietaryPattern = true;
      }
    } else if (pattern === 'vegetarian') {
      if (tags.vegetarian === 'false') {
        exclusionReasons.push('PADRAO_ALIMENTAR_INCOMPATIVEL: Alimento explicitamente não vegetariano.');
      } else if (tags.vegetarian !== 'true') {
        // 'unknown' ou ausente: não é presumido compatível quando obrigatório
        safetyWarnings.push('PADRAO_ALIMENTAR_INCERTO: Conformidade vegetariana desconhecida ou não comprovada.');
        unconfirmedDietaryPattern = true;
      }
    }
  }

  // 3. Alimentos Recusados pelo Paciente (foods_patient_refuses = HARD CONSTRAINT)
  for (const refused of constraints.foods_patient_refuses || []) {
    const normRefused = normalizeFoodText(refused);
    if (normRefused && allNames.some((n) => n.includes(normRefused))) {
      exclusionReasons.push(`RECUSA_EXPLICITA_DO_PACIENTE: ${refused}`);
    }
  }

  // 4. Alimentos Desgostados (disliked_foods = SOFT PREFERENCE, salvo recusa explícita acima)
  let isDisliked = false;
  for (const disliked of constraints.disliked_foods || []) {
    const normDisliked = normalizeFoodText(disliked);
    if (normDisliked && allNames.some((n) => n.includes(normDisliked))) {
      safetyWarnings.push(`PREFERENCIA_NEGATIVA_DO_PACIENTE: ${disliked}`);
      isDisliked = true;
    }
  }

  let finalStatus: FoodEligibilityStatus = 'allowed';
  if (exclusionReasons.length > 0) {
    finalStatus = 'blocked';
  } else if (reviewRequiredAllergens.length > 0 || unconfirmedDietaryPattern) {
    finalStatus = 'review_required';
  }

  return {
    status: finalStatus,
    is_compatible: finalStatus === 'allowed',
    exclusion_reasons: exclusionReasons,
    safety_warnings: safetyWarnings,
    blocked_allergens: blockedAllergens,
    review_required_allergens: reviewRequiredAllergens,
    is_disliked: isDisliked,
  };
}

/**
 * Avaliação isolada tri-state de segurança de um alergênico para um alimento.
 */
export function evaluateFoodAllergenSafety(
  foodTags: Record<string, 'true' | 'false' | 'unknown'> | undefined,
  allergen: StructuredAllergen
): {
  status: FoodEligibilityStatus;
  tag_code: string;
  tag_value: 'true' | 'false' | 'unknown';
} {
  const config = STRUCTURED_ALLERGENS_MAP[allergen];
  const tagCode = config ? config.tag : `contains_${allergen}`;
  const tagVal = foodTags?.[tagCode] || 'unknown';

  if (tagVal === 'true') {
    return { status: 'blocked', tag_code: tagCode, tag_value: 'true' };
  }
  if (tagVal === 'false') {
    return { status: 'allowed', tag_code: tagCode, tag_value: 'false' };
  }
  return { status: 'review_required', tag_code: tagCode, tag_value: 'unknown' };
}
