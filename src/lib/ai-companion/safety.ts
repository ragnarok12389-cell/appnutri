/**
 * Camada de Segurança Pré-LLM (Independent Safety Classifier) — ETAPA 8
 * Executada rigorosamente ANTES de qualquer interação com o modelo de linguagem.
 * Princípio Central: SYMPTOM != DIAGNOSIS. Zero autoridade médica ou prescritiva na IA.
 */

import { SafetyClassificationResult } from '@/types/ai-companion';

interface SafetyPatternRule {
  category: SafetyClassificationResult['category'];
  patterns: RegExp[];
  flags: string[];
  block_llm: boolean;
  recommended_action: SafetyClassificationResult['recommended_action'];
  safe_response_override: string;
}

const SAFETY_RULES: SafetyPatternRule[] = [
  // 1. EMERGÊNCIA MÉDICA OU RISCO À INTEGRIDADE FÍSICA
  {
    category: 'medical_emergency',
    patterns: [
      /\b(dor\s+no\s+peito|press[aã]o\s+no\s+peito|aperto\s+no\s+peito)\b/i,
      /\b(falta\s+de\s+ar\s+(grave|severa|intensa|s[uú]bita)|n[aã]o\s+consigo\s+respirar)\b/i,
      /\b(desmaio|desmaiei|perdi\s+os\s+sentidos|perda\s+de\s+consci[eê]ncia)\b/i,
      /\b(hemorragia|sangramento\s+(intenso|grave|abundante))\b/i,
      /\b(suic[ií]dio|me\s+matar|tirar\s+minha\s+vida|me\s+machucar)\b/i,
    ],
    flags: ['medical_emergency', 'immediate_attention_required'],
    block_llm: true,
    recommended_action: 'emergency_services',
    safe_response_override:
      'Percebi que você relatou sintomas ou situações que exigem atenção médica imediata. Como assistente virtual do AppNutri, não possuo capacidade nem autorização médica. Por favor, procure um serviço de emergência médica (como o SAMU 192 ou pronto-socorro mais próximo) imediatamente para sua segurança.',
  },

  // 2. PRESCRIÇÃO OU AJUSTE DE MEDICAMENTOS / FÁRMACOS
  {
    category: 'medication_prescription',
    patterns: [
      /\b(qual\s+rem[eé]dio|qual\s+medicamento|posso\s+tomar\s+rem[eé]dio)\b/i,
      /\b(devo\s+tomar\s+(omeprazol|antibi[oó]tico|anti-?inflamat[oó]rio|ansiol[ií]tico))\b/i,
      /\b(aumentar\s+a\s+dose|diminuir\s+a\s+dose|parar\s+de\s+tomar\s+meu\s+rem[eé]dio)\b/i,
      /\b(ciclo\s+de|anabolizante|durateston|trembolona|oxandrolona|testosterona\s+injet[aá]vel)\b/i,
    ],
    flags: ['medication_inquiry', 'physician_referral_required'],
    block_llm: true,
    recommended_action: 'physician_consultation',
    safe_response_override:
      'Prescrições farmacológicas, ajustes de dosagem ou descontinuação de medicamentos são atos médicos exclusivos. O AppNutri não prescreve nem orienta o uso de substâncias farmacológicas ou esteroides. Converse diretamente com o seu médico responsável.',
  },

  // 3. PEDIDO DE DIAGNÓSTICO CLÍNICO OU INTERPRETAÇÃO DE SINTOMAS
  {
    category: 'clinical_diagnosis',
    patterns: [
      /\b(que\s+doen[cç]a\s+eu\s+tenho|estou\s+com\s+c[aâ]ncer|diagnosticar|tenho\s+diabetes\?)\b/i,
      /\b(meu\s+(joelho|ombro|cotovelo|tornozelo)\s+(estourou|rompeu|est[aá]\s+inchado\s+e\s+doendo))\b/i,
      /\b(sintoma\s+de\s+que\s+doen[cç]a)\b/i,
    ],
    flags: ['symptom_not_diagnosis', 'clinical_assessment_required'],
    block_llm: true,
    recommended_action: 'physician_consultation',
    safe_response_override:
      'No AppNutri seguimos o princípio fundamental de que sintomas relatados não equivalem a diagnósticos automáticos (SYMPTOM != DIAGNOSIS). Dores articulares intensas, inchaços ou sintomas clínicos precisam ser examinados presencialmente por um médico ou fisioterapeuta antes de qualquer ajuste de treino.',
  },

  // 4. DIETAS EXTREMAS / DISTÚRBIOS ALIMENTARES
  {
    category: 'extreme_diet_disorder',
    patterns: [
      /\b(jejuar\s+por\s+(7|10|15|30)\s+dias|passar\s+fome\s+para\s+emagrecer)\b/i,
      /\b(vomitar\s+depois\s+de\s+comer|for[cç]ar\s+v[oô]mito|tomar\s+laxante\s+pra\s+emagrecer)\b/i,
      /\b(comer\s+(menos\s+de\s+)?(300|400|500)\s*kcal)\b/i,
    ],
    flags: ['eating_disorder_risk', 'extreme_restriction_blocked'],
    block_llm: true,
    recommended_action: 'nutritionist_consultation',
    safe_response_override:
      'Estratégias drásticas de restrição calórica extrema, purgação ou jejuns prolongados sem supervisão especializada colocam a sua saúde em sério risco. O plano alimentar do AppNutri é elaborado para garantir nutrição segura e sustentável. Se estiver passando por dificuldades alimentares, converse com seu nutricionista ou profissional de saúde.',
  },
];

/**
 * Avalia o texto do usuário e classifica riscos à segurança antes de consultar o LLM.
 */
export function classifyInputSafety(input: string): SafetyClassificationResult {
  const normalized = input.trim();

  for (const rule of SAFETY_RULES) {
    for (const pattern of rule.patterns) {
      if (pattern.test(normalized)) {
        return {
          is_safe: false,
          category: rule.category,
          flags: rule.flags,
          block_llm: rule.block_llm,
          recommended_action: rule.recommended_action,
          safe_response_override: rule.safe_response_override,
        };
      }
    }
  }

  return {
    is_safe: true,
    category: 'safe',
    flags: [],
    block_llm: false,
    recommended_action: 'none',
  };
}
