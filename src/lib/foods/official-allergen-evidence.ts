import { StructuredAllergen } from '@/types/food';

type TriState = 'true' | 'false' | 'unknown';

const ALLERGEN_TERMS: Record<StructuredAllergen, string[]> = {
  gluten: ['gluten', 'trigo', 'centeio', 'cevada', 'aveia'],
  milk: ['leite', 'lactose', 'caseina', 'soro de leite', 'queijo', 'iogurte'],
  egg: ['ovo', 'ovos', 'clara', 'gema', 'albumina'],
  peanut: ['amendoim'],
  soy: ['soja'],
  fish: ['peixe', 'pescado', 'bacalhau', 'salmao', 'atum', 'sardinha', 'tilapia'],
  shellfish: ['camarao', 'lagosta', 'siri', 'caranguejo', 'marisco', 'ostra', 'mexilhao', 'lula', 'polvo'],
  tree_nuts: ['castanha', 'nozes', 'amendoa', 'avela', 'pistache', 'macadamia'],
};

const CLEAR_WHOLE_FOOD_GROUPS = new Set([
  'Carnes e derivados',
  'Cereais e derivados',
  'Frutas e derivados',
  'Gorduras e óleos',
  'Leguminosas e derivados',
  'Leite e derivados',
  'Nozes e sementes',
  'Ovos e derivados',
  'Pescados e frutos do mar',
  'Verduras, hortaliças e derivados',
]);

function normalize(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

/**
 * Produz evidência complementar somente para itens oficiais da TACO.
 * Um termo explícito prova presença. Ausência só prova segurança para
 * frutos do mar em grupos de alimentos integrais que não sejam pescados;
 * preparados e industrializados continuam UNKNOWN.
 */
export function inferOfficialAllergenEvidence(food: {
  name: string;
  normalized_name: string;
  food_group: string;
  source_type: string;
}): Record<string, TriState> {
  if (!['official', 'official_table'].includes(food.source_type)) return {};

  const searchable = normalize(`${food.name} ${food.normalized_name}`);
  const evidence: Record<string, TriState> = {};

  for (const [allergen, terms] of Object.entries(ALLERGEN_TERMS) as [StructuredAllergen, string[]][]) {
    if (terms.some((term) => searchable.includes(term))) {
      evidence[`contains_${allergen}`] = 'true';
    }
  }

  if (
    !evidence.contains_shellfish &&
    CLEAR_WHOLE_FOOD_GROUPS.has(food.food_group) &&
    food.food_group !== 'Pescados e frutos do mar'
  ) {
    evidence.contains_shellfish = 'false';
  }

  return evidence;
}
