import { PatientNutritionProfile, PatientNutritionSensitive } from '@/types/nutrition-profile';
import { EngineRunStatus, ScreeningReasonCode } from '@/types/nutrition-engine';
import { SAFETY_BOUNDS, VALID_ACTIVITY_LEVELS } from '../config';
import { calculateAgeInYears } from '../formulas/bmr/mifflin-st-jeor';

export interface SafetyScreeningResult {
  status: EngineRunStatus;
  requires_professional_review: boolean;
  review_reason_codes: ScreeningReasonCode[];
  age_years?: number;
  bmi?: number;
}

/**
 * Camada determinística de triagem e elegibilidade clínica do paciente.
 * NÃO utiliza IA, NÃO diagnostica patologias e NÃO analisa texto livre.
 * Decisões baseiam-se exclusivamente em campos estruturados e validados.
 */
export function performSafetyScreening(
  snapshot: Partial<PatientNutritionProfile>,
  sensitiveSnapshot?: Partial<PatientNutritionSensitive> | null
): SafetyScreeningResult {
  const reasons: ScreeningReasonCode[] = [];

  // 1. Verificação de Dados Biométricos Mínimos Obrigatórios
  if (
    !snapshot.height_cm ||
    snapshot.height_cm <= 0 ||
    !snapshot.current_weight_kg ||
    snapshot.current_weight_kg <= 0 ||
    !snapshot.birth_date ||
    !snapshot.birth_date.trim() ||
    !snapshot.biological_sex ||
    !['male', 'female'].includes(snapshot.biological_sex)
  ) {
    return {
      status: 'insufficient_data',
      requires_professional_review: false,
      review_reason_codes: ['MISSING_REQUIRED_DATA'],
    };
  }

  // 2. Validação Estrita de Nível de Atividade (Sem Fallback Silencioso)
  if (!snapshot.activity_level || !VALID_ACTIVITY_LEVELS.includes(snapshot.activity_level)) {
    return {
      status: 'insufficient_data',
      requires_professional_review: false,
      review_reason_codes: ['MISSING_OR_INVALID_ACTIVITY_LEVEL'],
    };
  }

  // 3. Cálculo e Triagem de Idade (Menores de 18 anos exigem revisão profissional)
  let ageYears = 30;
  try {
    ageYears = calculateAgeInYears(snapshot.birth_date);
    if (ageYears < SAFETY_BOUNDS.MIN_ADULT_AGE) {
      reasons.push('AGE_REQUIRES_REVIEW');
    }
  } catch {
    return {
      status: 'insufficient_data',
      requires_professional_review: false,
      review_reason_codes: ['MISSING_REQUIRED_DATA'],
    };
  }

  // 4. Triagem Antropométrica (IMC Outlier)
  const heightM = snapshot.height_cm / 100;
  const bmi = Math.round((snapshot.current_weight_kg / (heightM * heightM)) * 10) / 10;
  if (bmi < SAFETY_BOUNDS.BMI_MIN_OUTLIER || bmi > SAFETY_BOUNDS.BMI_MAX_OUTLIER) {
    reasons.push('ANTHROPOMETRIC_DATA_OUTLIER');
  }

  // 5. Triagem de Metas Extremas (> 40% do peso corporal)
  if (snapshot.target_weight_kg && snapshot.target_weight_kg > 0) {
    const diffKg = Math.abs(snapshot.current_weight_kg - snapshot.target_weight_kg);
    if (diffKg / snapshot.current_weight_kg > 0.40) {
      reasons.push('EXTREME_TARGET_REPORTED');
    }
  }

  // 6. Triagem Clínica Específica Estruturada (Sem parsing de texto livre)
  if (sensitiveSnapshot) {
    if (sensitiveSnapshot.is_pregnant) {
      reasons.push('PREGNANCY_REPORTED');
    }
    if (sensitiveSnapshot.is_breastfeeding) {
      reasons.push('BREASTFEEDING_REPORTED');
    }
    if (sensitiveSnapshot.has_eating_disorder_history) {
      reasons.push('EATING_DISORDER_RISK_REPORTED');
    }
    if (sensitiveSnapshot.has_severe_allergies) {
      reasons.push('SEVERE_ALLERGY_REPORTED');
    }

    // Flag booleana estruturada ou restrições prescritas (NUNCA busca texto livre em medical_dietary_notes)
    const hasStructuredClinicalCondition =
      Boolean(sensitiveSnapshot.has_reported_clinical_condition) ||
      (Array.isArray(sensitiveSnapshot.clinical_dietary_restrictions) &&
        sensitiveSnapshot.clinical_dietary_restrictions.length > 0);

    if (hasStructuredClinicalCondition) {
      reasons.push('CLINICAL_CONDITION_REPORTED');
    }
  }

  // Casos que exigem acompanhamento clínico são direcionados para 'review_required'
  // (o status 'blocked' é reservado para restrições operacionais/administrativas explícitas)
  if (reasons.length > 0) {
    return {
      status: 'review_required',
      requires_professional_review: true,
      review_reason_codes: reasons,
      age_years: ageYears,
      bmi,
    };
  }

  return {
    status: 'calculated',
    requires_professional_review: false,
    review_reason_codes: [],
    age_years: ageYears,
    bmi,
  };
}
