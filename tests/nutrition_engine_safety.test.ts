import { describe, it, expect } from 'vitest';
import { performSafetyScreening } from '../src/lib/nutrition-engine/safety/screening';
import { runNutritionEngine } from '../src/lib/nutrition-engine/engine';
import { PatientNutritionProfile, PatientNutritionSensitive, ActivityLevel } from '../src/types/nutrition-profile';

describe('Deterministic Nutrition Engine - Safety Screening & Eligibility Gate', () => {
  const baseProfile: Partial<PatientNutritionProfile> = {
    id: 'prof-valid-1',
    patient_id: 'pat-valid-1',
    current_weight_kg: 70,
    height_cm: 175,
    birth_date: '1990-05-10', // ~35 years old
    biological_sex: 'male',
    activity_level: 'moderate',
    primary_goal: 'lose_weight',
    desired_rate_of_change: 'moderate',
    desired_meals_per_day: 4,
    food_budget_amount: 600,
    food_budget_period: 'monthly',
    is_budget_exclusive_for_patient: true,
  };

  const baseSensitive: Partial<PatientNutritionSensitive> = {
    id: 'sens-valid-1',
    patient_id: 'pat-valid-1',
    food_allergies: [],
    food_intolerances: [],
    medical_dietary_notes: null,
    is_pregnant: false,
    is_breastfeeding: false,
    has_eating_disorder_history: false,
    has_severe_allergies: false,
    has_reported_clinical_condition: false,
    clinical_dietary_restrictions: [],
  };

  it('should flag underage patient (< 18) with AGE_REQUIRES_REVIEW and require professional review', () => {
    // Born in 2012 -> 13 years old
    const underageProfile: Partial<PatientNutritionProfile> = {
      ...baseProfile,
      birth_date: '2012-01-01',
    };

    const screening = performSafetyScreening(underageProfile, baseSensitive);
    expect(screening.status).toBe('review_required');
    expect(screening.requires_professional_review).toBe(true);
    expect(screening.review_reason_codes).toContain('AGE_REQUIRES_REVIEW');

    const result = runNutritionEngine({
      patient_id: 'pat-valid-1',
      snapshot: underageProfile,
      sensitive_snapshot: baseSensitive,
    });
    expect(result.status).toBe('review_required');
    expect(result.requires_professional_review).toBe(true);
    expect(result.clinical_review.clinical_reason_codes).toContain('AGE_REQUIRES_REVIEW');
  });

  it('should reject invalid or missing activity_level with MISSING_OR_INVALID_ACTIVITY_LEVEL', () => {
    const invalidActivityProfile: Partial<PatientNutritionProfile> = {
      ...baseProfile,
      activity_level: 'invalid_custom_level' as unknown as ActivityLevel,
    };

    const screening = performSafetyScreening(invalidActivityProfile, baseSensitive);
    expect(screening.status).toBe('insufficient_data');
    expect(screening.review_reason_codes).toContain('MISSING_OR_INVALID_ACTIVITY_LEVEL');

    const result = runNutritionEngine({
      patient_id: 'pat-valid-1',
      snapshot: invalidActivityProfile,
      sensitive_snapshot: baseSensitive,
    });
    expect(result.status).toBe('insufficient_data');
    expect(result.clinical_review.clinical_reason_codes).toContain('MISSING_OR_INVALID_ACTIVITY_LEVEL');
    expect(result.targets).toBeNull();
  });

  it('should flag pregnancy reported with PREGNANCY_REPORTED', () => {
    const pregnantSensitive: Partial<PatientNutritionSensitive> = {
      ...baseSensitive,
      is_pregnant: true,
    };

    const screening = performSafetyScreening(baseProfile, pregnantSensitive);
    expect(screening.status).toBe('review_required');
    expect(screening.requires_professional_review).toBe(true);
    expect(screening.review_reason_codes).toContain('PREGNANCY_REPORTED');

    const result = runNutritionEngine({
      patient_id: 'pat-valid-1',
      snapshot: baseProfile,
      sensitive_snapshot: pregnantSensitive,
    });
    expect(result.status).toBe('review_required');
    expect(result.clinical_review.clinical_reason_codes).toContain('PREGNANCY_REPORTED');
  });

  it('should flag breastfeeding reported with BREASTFEEDING_REPORTED', () => {
    const bfSensitive: Partial<PatientNutritionSensitive> = {
      ...baseSensitive,
      is_breastfeeding: true,
    };

    const screening = performSafetyScreening(baseProfile, bfSensitive);
    expect(screening.status).toBe('review_required');
    expect(screening.requires_professional_review).toBe(true);
    expect(screening.review_reason_codes).toContain('BREASTFEEDING_REPORTED');
  });

  it('should flag eating disorder history with EATING_DISORDER_RISK_REPORTED', () => {
    const edSensitive: Partial<PatientNutritionSensitive> = {
      ...baseSensitive,
      has_eating_disorder_history: true,
    };

    const screening = performSafetyScreening(baseProfile, edSensitive);
    expect(screening.status).toBe('review_required');
    expect(screening.requires_professional_review).toBe(true);
    expect(screening.review_reason_codes).toContain('EATING_DISORDER_RISK_REPORTED');
  });

  it('should flag severe allergies reported with SEVERE_ALLERGY_REPORTED', () => {
    const allergySensitive: Partial<PatientNutritionSensitive> = {
      ...baseSensitive,
      has_severe_allergies: true,
      food_allergies: ['amendoim (choque anafilático)'],
    };

    const screening = performSafetyScreening(baseProfile, allergySensitive);
    expect(screening.status).toBe('review_required');
    expect(screening.requires_professional_review).toBe(true);
    expect(screening.review_reason_codes).toContain('SEVERE_ALLERGY_REPORTED');
  });

  it('should flag reported clinical conditions via structured flag and NOT parse free text', () => {
    // 1. Structured condition flag = true triggers CLINICAL_CONDITION_REPORTED
    const structuredClinicalSensitive: Partial<PatientNutritionSensitive> = {
      ...baseSensitive,
      has_reported_clinical_condition: true,
      medical_dietary_notes: null,
    };

    const screening1 = performSafetyScreening(baseProfile, structuredClinicalSensitive);
    expect(screening1.status).toBe('review_required');
    expect(screening1.requires_professional_review).toBe(true);
    expect(screening1.review_reason_codes).toContain('CLINICAL_CONDITION_REPORTED');

    // 2. Free text alone without structured flag does NOT trigger CLINICAL_CONDITION_REPORTED
    const freeTextOnlySensitive: Partial<PatientNutritionSensitive> = {
      ...baseSensitive,
      has_reported_clinical_condition: false,
      medical_dietary_notes: 'O paciente mencionou que tem histórico de diabetes na família',
    };

    const screening2 = performSafetyScreening(baseProfile, freeTextOnlySensitive);
    expect(screening2.status).toBe('calculated');
    expect(screening2.requires_professional_review).toBe(false);
    expect(screening2.review_reason_codes).not.toContain('CLINICAL_CONDITION_REPORTED');
  });

  it('should flag anthropometric outliers with ANTHROPOMETRIC_DATA_OUTLIER', () => {
    // Outlier 1: Severe underweight BMI < 16 (e.g. 40kg, 180cm -> BMI = 12.3)
    const severeUnderweight: Partial<PatientNutritionProfile> = {
      ...baseProfile,
      current_weight_kg: 40,
      height_cm: 180,
    };

    const screening1 = performSafetyScreening(severeUnderweight, baseSensitive);
    expect(screening1.status).toBe('review_required');
    expect(screening1.review_reason_codes).toContain('ANTHROPOMETRIC_DATA_OUTLIER');

    // Outlier 2: Severe obesity BMI > 45 (e.g. 150kg, 160cm -> BMI = 58.6)
    const severeObese: Partial<PatientNutritionProfile> = {
      ...baseProfile,
      current_weight_kg: 150,
      height_cm: 160,
    };

    const screening2 = performSafetyScreening(severeObese, baseSensitive);
    expect(screening2.status).toBe('review_required');
    expect(screening2.review_reason_codes).toContain('ANTHROPOMETRIC_DATA_OUTLIER');
  });

  it('should flag missing mandatory anthropometric or demographic data with MISSING_REQUIRED_DATA', () => {
    // Missing weight
    const missingWeight: Partial<PatientNutritionProfile> = {
      ...baseProfile,
      current_weight_kg: null,
    };

    const screening = performSafetyScreening(missingWeight, baseSensitive);
    expect(screening.status).toBe('insufficient_data');
    expect(screening.review_reason_codes).toContain('MISSING_REQUIRED_DATA');

    const result = runNutritionEngine({
      patient_id: 'pat-valid-1',
      snapshot: missingWeight,
      sensitive_snapshot: baseSensitive,
    });
    expect(result.status).toBe('insufficient_data');
    expect(result.targets).toBeNull();
  });

  it('should allow automated calculation for healthy standard adult with no risk flags', () => {
    const screening = performSafetyScreening(baseProfile, baseSensitive);
    expect(screening.status).toBe('calculated');
    expect(screening.requires_professional_review).toBe(false);
    expect(screening.review_reason_codes).toHaveLength(0);

    const result = runNutritionEngine({
      patient_id: 'pat-valid-1',
      snapshot: baseProfile,
      sensitive_snapshot: baseSensitive,
    });

    expect(result.status).toBe('calculated');
    expect(result.requires_professional_review).toBe(false);
    expect(result.clinical_review.clinical_reason_codes).toHaveLength(0);
    expect(result.targets).not.toBeNull();
    expect(result.targets?.estimated_bmr_kcal).toBeGreaterThan(1000);
  });
});
