import { describe, it, expect } from 'vitest';
import { calculateMifflinStJeor, calculateAgeInYears } from '../src/lib/nutrition-engine/formulas/bmr/mifflin-st-jeor';
import { calculateTdee } from '../src/lib/nutrition-engine/formulas/tdee';
import { calculateEnergyTarget } from '../src/lib/nutrition-engine/formulas/energy-target';
import { calculateMacronutrients } from '../src/lib/nutrition-engine/formulas/macros';
import { normalizeBudgetAndMeals } from '../src/lib/nutrition-engine/formulas/budget';
import { buildNutritionConstraints } from '../src/lib/nutrition-engine/constraints';
import { calculateEngineInputHashes } from '../src/lib/nutrition-engine/hash';
import { runNutritionEngine } from '../src/lib/nutrition-engine/engine';
import { PatientNutritionProfile, PatientNutritionSensitive } from '../src/types/nutrition-profile';

describe('Deterministic Nutrition Engine - Mathematical & Algorithmic Correctness', () => {
  describe('1. BMR - Mifflin-St Jeor Formula', () => {
    it('should calculate accurate BMR for standard adult male fixture', () => {
      // Mifflin-St Jeor formula for male:
      // (10 * weight_kg) + (6.25 * height_cm) - (5 * age_years) + 5
      // 80kg, 180cm, 30yo:
      // 10*80 = 800
      // 6.25*180 = 1125
      // 5*30 = 150
      // 800 + 1125 - 150 + 5 = 1780 kcal
      const result = calculateMifflinStJeor({
        weight_kg: 80,
        height_cm: 180,
        age_years: 30,
        biological_sex: 'male',
      });

      expect(result.formula).toBe('mifflin_st_jeor');
      expect(result.formula_version).toBe('1.0.0');
      expect(result.bmr_kcal).toBe(1780);
    });

    it('should calculate accurate BMR for standard adult female fixture', () => {
      // Mifflin-St Jeor formula for female:
      // (10 * weight_kg) + (6.25 * height_cm) - (5 * age_years) - 161
      // 60kg, 165cm, 28yo:
      // 10*60 = 600
      // 6.25*165 = 1031.25
      // 5*28 = 140
      // 600 + 1031.25 - 140 - 161 = 1330.25 kcal
      const result = calculateMifflinStJeor({
        weight_kg: 60,
        height_cm: 165,
        age_years: 28,
        biological_sex: 'female',
      });

      expect(result.bmr_kcal).toBe(1330.25);
    });

    it('should calculate exact age from birth date string', () => {
      const birthDate = '1995-06-15';
      const refDate = new Date('2025-06-15');
      const age = calculateAgeInYears(birthDate, refDate);
      expect(age).toBe(30);

      // Day before 30th birthday
      const refBefore = new Date('2025-06-14');
      expect(calculateAgeInYears(birthDate, refBefore)).toBe(29);
    });
  });

  describe('2. TDEE - Total Daily Energy Expenditure', () => {
    const bmr = 1780;

    it('should calculate correct TDEE for all standardized activity levels', () => {
      // sedentary: 1.2
      const sedentary = calculateTdee(bmr, 'sedentary');
      expect(sedentary.activity_factor).toBe(1.2);
      expect(sedentary.tdee_kcal).toBe(2136);

      // light: 1.375
      const light = calculateTdee(bmr, 'light');
      expect(light.activity_factor).toBe(1.375);
      expect(light.tdee_kcal).toBe(2447.5);

      // moderate: 1.55
      const moderate = calculateTdee(bmr, 'moderate');
      expect(moderate.activity_factor).toBe(1.55);
      expect(moderate.tdee_kcal).toBe(2759);

      // high: 1.725
      const high = calculateTdee(bmr, 'high');
      expect(high.activity_factor).toBe(1.725);
      expect(high.tdee_kcal).toBe(3070.5);

      // very_high: 1.9
      const veryHigh = calculateTdee(bmr, 'very_high');
      expect(veryHigh.activity_factor).toBe(1.9);
      expect(veryHigh.tdee_kcal).toBe(3382);
    });

    it('should throw explicit error if unknown activity level is provided (no silent fallback)', () => {
      expect(() => calculateTdee(bmr, 'unknown_level')).toThrow(
        /inválido ou desconhecido/i
      );
    });
  });

  describe('3. Energy Target, Caloric Bands & Clamping Guardrails', () => {
    const tdee = 2500;
    const bmr = 1700;

    it('should calculate deficit for weight loss based on rate of change', () => {
      // moderate lose_weight = -500 kcal (20% do TDEE)
      const moderateLoss = calculateEnergyTarget(tdee, bmr, 'male', 'lose_weight', 'moderate');

      expect(moderateLoss.goal_adjustment_kcal).toBe(-500);
      expect(moderateLoss.target_calories_nominal_kcal).toBe(2000);
      expect(moderateLoss.target_calories_min_kcal).toBe(1900); // 2000 - 100
      expect(moderateLoss.target_calories_max_kcal).toBe(2100); // 2000 + 100
      expect(moderateLoss.target_was_clamped).toBe(false);
      expect(moderateLoss.clamp_reason).toBeNull();

      // slow lose_weight = -300 kcal (12% do TDEE)
      const slowLoss = calculateEnergyTarget(tdee, bmr, 'male', 'lose_weight', 'slow');
      expect(slowLoss.goal_adjustment_kcal).toBe(-300);
      expect(slowLoss.target_calories_nominal_kcal).toBe(2200);
    });

    it('should calculate surplus for muscle gain', () => {
      // moderate gain_muscle = +350 kcal
      const muscleGain = calculateEnergyTarget(tdee, bmr, 'male', 'gain_muscle', 'moderate');

      expect(muscleGain.goal_adjustment_kcal).toBe(350);
      expect(muscleGain.target_calories_nominal_kcal).toBe(2850);
      expect(muscleGain.target_calories_min_kcal).toBe(2750);
      expect(muscleGain.target_calories_max_kcal).toBe(2950);
      expect(muscleGain.target_was_clamped).toBe(false);
    });

    it('should maintain calories near TDEE for maintain_weight and improve_health', () => {
      const maintain = calculateEnergyTarget(tdee, bmr, 'male', 'maintain_weight', 'moderate');

      expect(maintain.goal_adjustment_kcal).toBe(0);
      expect(maintain.target_calories_nominal_kcal).toBe(2500);
      expect(maintain.target_was_clamped).toBe(false);
    });

    it('should record target_was_clamped = true and clamp_reason when hitting operational guardrail floor', () => {
      // Female operational guardrail is 1200 kcal
      const lowTdee = 1300;
      const target = calculateEnergyTarget(lowTdee, 1100, 'female', 'lose_weight', 'fast');

      // 1300 - 750 = 550, but guardrail floor is 1200 kcal!
      expect(target.raw_target_calories_nominal_kcal).toBe(550);
      expect(target.target_calories_nominal_kcal).toBe(1200);
      expect(target.target_was_clamped).toBe(true);
      expect(target.clamp_reason).toBe('GUARDRAIL_MIN_FLOOR_FEMALE');
      expect(target.requires_professional_review).toBe(true);
      expect(target.review_reason_codes).toContain('GUARDRAIL_CLAMP_APPLIED');
    });

    it('should flag EXCESSIVE_DEFICIT_REQUESTED when deficit exceeds MAX_ENGINE_DEFICIT_PERCENTAGE_TDEE (25% of TDEE)', () => {
      // TDEE = 1800, fast loss = -750 -> 750/1800 = 41.7% > 25%
      const excessiveLoss = calculateEnergyTarget(1800, 1400, 'male', 'lose_weight', 'fast');
      expect(excessiveLoss.requires_professional_review).toBe(true);
      expect(excessiveLoss.review_reason_codes).toContain('EXCESSIVE_DEFICIT_REQUESTED');
    });

    it('should flag EXCESSIVE_SURPLUS_REQUESTED when surplus exceeds MAX_ENGINE_SURPLUS_PERCENTAGE_TDEE (20% of TDEE)', () => {
      // TDEE = 2000, fast gain = +500 -> 500/2000 = 25% > 20%
      const excessiveGain = calculateEnergyTarget(2000, 1400, 'male', 'gain_muscle', 'fast');
      expect(excessiveGain.requires_professional_review).toBe(true);
      expect(excessiveGain.review_reason_codes).toContain('EXCESSIVE_SURPLUS_REQUESTED');
    });
  });

  describe('4. Macronutrient Distribution, Reference Weight & Invariants', () => {
    it('should satisfy thermodynamic energy conservation: 4*P + 4*C + 9*F = Nominal Calories within 3 kcal', () => {
      const testCases = [
        { calories: 2000, weight: 75, height: 178, goal: 'lose_weight' },
        { calories: 2800, weight: 85, height: 182, goal: 'gain_muscle' },
        { calories: 1500, weight: 55, height: 160, goal: 'maintain_weight' },
        { calories: 2200, weight: 70, height: 175, goal: 'body_recomposition' },
        { calories: 3200, weight: 90, height: 185, goal: 'improve_performance' },
      ];

      for (const tc of testCases) {
        const macros = calculateMacronutrients(tc.calories, tc.weight, tc.height, tc.goal);

        // 1. Grams must not be NaN or negative
        expect(macros.protein_g).toBeGreaterThan(0);
        expect(macros.carbohydrate_g).toBeGreaterThan(0);
        expect(macros.fat_g).toBeGreaterThan(0);
        expect(Number.isNaN(macros.protein_g)).toBe(false);
        expect(Number.isNaN(macros.carbohydrate_g)).toBe(false);
        expect(Number.isNaN(macros.fat_g)).toBe(false);

        // 2. Exact caloric sum check
        const calculatedTotalKcal = macros.protein_kcal + macros.carbohydrate_kcal + macros.fat_kcal;
        const delta = Math.abs(calculatedTotalKcal - tc.calories);
        expect(delta).toBeLessThanOrEqual(3.0); // Within tolerance

        // 3. Percentages sum to 100% (+- 0.5%)
        const totalPct = macros.protein_percentage + macros.carbohydrate_percentage + macros.fat_percentage;
        expect(Math.abs(totalPct - 100)).toBeLessThanOrEqual(0.5);
      }
    });

    it('should use adjusted_weight heuristic for obese patients (BMI >= 30) and require review for severe obesity (BMI >= 40)', () => {
      // 130kg, 175cm -> BMI = 42.4 (Obeso Grau III)
      // Ideal weight (BMI 24.9) = 24.9 * (1.75^2) = 76.25 kg
      // Adjusted weight = 76.25 + 0.25 * (130 - 76.25) = 89.69 kg
      const obeseMacros = calculateMacronutrients(2200, 130, 175, 'lose_weight');

      expect(obeseMacros.macro_reference_weight_strategy).toBe('adjusted_weight');
      expect(obeseMacros.macro_reference_weight_kg).toBeLessThan(100);
      expect(obeseMacros.macro_reference_weight_kg).toBeCloseTo(89.7, 0);

      // Protein should be calculated on ~90kg (~180g), NOT on 130kg (which would be 260g!)
      expect(obeseMacros.protein_g).toBeLessThan(200);
      expect(obeseMacros.review_reason_codes).toContain('OBESITY_ADJUSTED_MACRO_WEIGHT');
      expect(obeseMacros.review_reason_codes).toContain('EXTREME_BMI_REQUIRES_CLINICAL_REVIEW');
      expect(obeseMacros.requires_professional_review).toBe(true);
    });

    it('should keep extreme underweight anthropometric cases (BMI < 16) in review_required', () => {
      // 38kg, 165cm -> BMI = 13.95 (< 16)
      const underweightMacros = calculateMacronutrients(1600, 38, 165, 'gain_muscle');

      expect(underweightMacros.requires_professional_review).toBe(true);
      expect(underweightMacros.review_reason_codes).toContain('EXTREME_BMI_REQUIRES_CLINICAL_REVIEW');
    });

    it('should enforce macro invariants and require review if available calories cannot cover essential macros', () => {
      // 80kg, 180cm with extremely low budget (e.g. 500 kcal):
      // Essential protein: 1.2 * 80 = 96g (384 kcal)
      // Essential fat: 0.6 * 80 = 48g (432 kcal)
      // Total essential = 816 kcal > 500 kcal!
      const impossibleMacros = calculateMacronutrients(500, 80, 180, 'lose_weight');

      expect(impossibleMacros.requires_professional_review).toBe(true);
      expect(impossibleMacros.review_reason_codes).toContain('INSUFFICIENT_CALORIES_FOR_ESSENTIAL_MACROS');
      expect(impossibleMacros.carbohydrate_g).toBeGreaterThanOrEqual(0); // Carbohydrate NEVER negative!
    });
  });

  describe('5. Budget Normalization & Household Proportions', () => {
    it('should normalize monthly exclusive budget to daily and weekly correctly', () => {
      // R$ 600/month exclusive
      const budget = normalizeBudgetAndMeals(600, 'monthly', true, 1, 4, 2000, 'BRL');

      expect(budget.normalized_monthly_budget).toBe(600);
      expect(budget.normalized_daily_budget).toBeCloseTo(19.71, 1); // 600 / 30.4375
      expect(budget.normalized_weekly_budget).toBeCloseTo(138, 0);
      expect(budget.budget_estimate_type).toBe('individual_exact');
      expect(budget.currency).toBe('BRL');
    });

    it('should divide household budget proportionally when not exclusive to patient', () => {
      // R$ 1500/month for 4 people
      const budget = normalizeBudgetAndMeals(1500, 'monthly', false, 4, 4, 2000, 'BRL');

      // Total per person: 1500 / 4 = 375/month
      expect(budget.normalized_monthly_budget).toBe(375);
      expect(budget.normalized_daily_budget).toBeCloseTo(12.32, 1);
      expect(budget.budget_estimate_type).toBe('household_proportional');
    });

    it('should normalize daily and weekly inputs correctly', () => {
      const daily = normalizeBudgetAndMeals(30, 'daily', true, 1, 4, 2000, 'BRL');
      expect(daily.normalized_daily_budget).toBe(30);
      expect(daily.normalized_weekly_budget).toBe(210);

      const weekly = normalizeBudgetAndMeals(140, 'weekly', true, 1, 4, 2000, 'BRL');
      expect(weekly.normalized_daily_budget).toBe(20);
      expect(weekly.normalized_weekly_budget).toBe(140);
    });
  });

  describe('6. Constraints Structuring (NutritionConstraints)', () => {
    it('should transform nutrition profile into structured constraints without food picking', () => {
      const profile: Partial<PatientNutritionProfile> = {
        dietary_pattern: 'vegetarian',
        disliked_foods: ['coentro'],
        favorite_foods: ['ovos', 'aveia'],
        religious_or_cultural_restrictions: ['kosher'],
        available_cooking_time_minutes: 30,
        needs_packed_meals: true,
      };

      const sensitive: Partial<PatientNutritionSensitive> = {
        food_allergies: ['amendoim'],
        food_intolerances: ['lactose'],
        medical_dietary_notes: 'Sensibilidade leve a glúten relatada',
      };

      const constraints = buildNutritionConstraints(profile, sensitive, 25, 'individual_exact', 'BRL');

      expect(constraints.allowed_dietary_pattern).toBe('vegetarian');
      expect(constraints.disliked_foods).toContain('coentro');
      expect(constraints.favorite_foods).toContain('ovos');
      expect(constraints.religious_or_cultural_restrictions).toContain('kosher');
      expect(constraints.patient_reported_allergies).toContain('amendoim');
      expect(constraints.patient_reported_intolerances).toContain('lactose');
      expect(constraints.available_cooking_time_minutes).toBe(30);
      expect(constraints.logistics.needs_packed_meals).toBe(true);
      expect(constraints.budget_limit.daily_max).toBe(25);
    });
  });

  describe('7. Determinism, Idempotency & Modular Hashes', () => {
    const validProfile: Partial<PatientNutritionProfile> = {
      id: 'prof-1',
      patient_id: 'pat-1',
      current_weight_kg: 80,
      height_cm: 180,
      birth_date: '1995-01-01',
      biological_sex: 'male',
      activity_level: 'moderate',
      primary_goal: 'lose_weight',
      desired_rate_of_change: 'moderate',
      desired_meals_per_day: 4,
      food_budget_amount: 600,
      food_budget_period: 'monthly',
      is_budget_exclusive_for_patient: true,
      dietary_pattern: 'omnivore',
    };

    const inputData = {
      patient_id: 'pat-1',
      snapshot: validProfile,
      sensitive_snapshot: {
        id: 'sens-1',
        patient_id: 'pat-1',
        food_allergies: [],
        food_intolerances: [],
        is_pregnant: false,
        is_breastfeeding: false,
        has_eating_disorder_history: false,
        has_severe_allergies: false,
        has_reported_clinical_condition: false,
      },
      engine_version: 'nutrition-engine-1.1.0',
      config_version: 'config-1.1.0',
    };

    it('should generate modular hashes and ensure free text does NOT alter mathematical input hash', () => {
      const hashes1 = calculateEngineInputHashes(
        inputData.snapshot,
        inputData.sensitive_snapshot
      );

      // Sensitive snapshot with free text added
      const sensitiveWithFreeText = {
        ...inputData.sensitive_snapshot,
        medical_dietary_notes: 'Paciente relata que não gosta de comer após as 20h',
      };

      const hashes2 = calculateEngineInputHashes(
        inputData.snapshot,
        sensitiveWithFreeText
      );

      // Mathematical input_snapshot_hash and input_hash MUST BE IDENTICAL
      expect(hashes1.input_snapshot_hash).toBe(hashes2.input_snapshot_hash);
      expect(hashes1.safety_input_hash).toBe(hashes2.safety_input_hash);
      expect(hashes1.input_hash).toBe(hashes2.input_hash);
    });

    it('should execute engine idempotently with strictly identical numeric outputs and hashes', () => {
      const run1 = runNutritionEngine(inputData);
      const run2 = runNutritionEngine(inputData);

      expect(run1.status).toBe('calculated');
      expect(run2.status).toBe('calculated');

      expect(run1.input_hash).toBe(run2.input_hash);
      expect(run1.output_hash).toBe(run2.output_hash);

      expect(run1.targets).toBeDefined();
      expect(run2.targets).toBeDefined();

      if (run1.targets && run2.targets) {
        expect(run1.targets.estimated_bmr_kcal).toBe(run2.targets.estimated_bmr_kcal);
        expect(run1.targets.estimated_tdee_kcal).toBe(run2.targets.estimated_tdee_kcal);
        expect(run1.targets.target_calories_nominal_kcal).toBe(run2.targets.target_calories_nominal_kcal);
        expect(run1.targets.protein_g).toBe(run2.targets.protein_g);
        expect(run1.targets.carbohydrate_g).toBe(run2.targets.carbohydrate_g);
        expect(run1.targets.fat_g).toBe(run2.targets.fat_g);
        expect(run1.targets.normalized_daily_budget).toBe(run2.targets.normalized_daily_budget);
        expect(run1.targets.target_was_clamped).toBe(run2.targets.target_was_clamped);
      }
    });

    it('should change hash and produce new versioned targets if engine version changes', () => {
      const runV1 = runNutritionEngine(inputData);
      const runV2 = runNutritionEngine({
        ...inputData,
        engine_version: 'nutrition-engine-2.0.0',
      });

      expect(runV1.input_hash).not.toBe(runV2.input_hash);
      expect(runV2.engine_version).toBe('nutrition-engine-2.0.0');
    });
  });
});
