import { describe, it, expect } from 'vitest';
import { runNutritionEngine } from '../src/lib/nutrition-engine/engine';
import {
  PatientNutritionProfile,
  ActivityLevel,
  PrimaryGoal,
  RateOfChange,
} from '../src/types/nutrition-profile';

describe('Deterministic Nutrition Engine - Comprehensive Property & Grid Testing', () => {
  const weights = [40, 50, 70, 100, 150, 250];
  const heights = [145, 160, 175, 190, 205];
  const birthDates = [
    '2007-01-01', // 18 anos
    '1995-05-15', // 30 anos
    '1960-10-20', // 65 anos
  ];
  const sexes: Array<'male' | 'female'> = ['male', 'female'];
  const activityLevels: ActivityLevel[] = ['sedentary', 'light', 'moderate', 'high', 'very_high'];
  const goals: PrimaryGoal[] = [
    'lose_weight',
    'gain_muscle',
    'maintain_weight',
    'body_recomposition',
    'improve_health',
    'improve_performance',
  ];
  const rates: RateOfChange[] = ['slow', 'moderate', 'fast'];

  it(
    'should preserve all mathematical invariants across a combinatorial grid of 16,200 cases',
    () => {
      let executedCases = 0;

      for (const weight of weights) {
        for (const height of heights) {
          for (const birthDate of birthDates) {
            for (const sex of sexes) {
              for (const activity of activityLevels) {
                for (const goal of goals) {
                  for (const rate of rates) {
                    const snapshot: Partial<PatientNutritionProfile> = {
                      current_weight_kg: weight,
                      height_cm: height,
                      birth_date: birthDate,
                      biological_sex: sex,
                      activity_level: activity,
                      primary_goal: goal,
                      desired_rate_of_change: rate,
                      desired_meals_per_day: 4,
                      food_budget_amount: 800,
                      food_budget_period: 'monthly',
                      is_budget_exclusive_for_patient: true,
                    };

                    const result = runNutritionEngine({
                      patient_id: 'grid-patient',
                      snapshot,
                    });

                    executedCases++;

                    // Invariante 1: Status válido
                    expect(['calculated', 'review_required', 'insufficient_data']).toContain(
                      result.status
                    );

                    // Invariante 2: Hashes presentes e válidos (SHA-256 = 64 chars hex)
                    expect(result.input_hash).toHaveLength(64);
                    expect(result.output_hash).toHaveLength(64);
                    expect(result.input_snapshot_hash).toHaveLength(64);
                    expect(result.safety_input_hash).toHaveLength(64);
                    expect(result.engine_config_hash).toHaveLength(64);

                    // Se o resultado produziu targets:
                    if (result.targets) {
                      const t = result.targets;

                      // Invariante 3: Nenhum NaN ou Infinity
                      expect(Number.isNaN(t.estimated_bmr_kcal)).toBe(false);
                      expect(Number.isFinite(t.estimated_bmr_kcal)).toBe(true);
                      expect(Number.isNaN(t.estimated_tdee_kcal)).toBe(false);
                      expect(Number.isFinite(t.estimated_tdee_kcal)).toBe(true);
                      expect(Number.isNaN(t.target_calories_nominal_kcal)).toBe(false);
                      expect(Number.isFinite(t.target_calories_nominal_kcal)).toBe(true);
                      expect(Number.isNaN(t.protein_g)).toBe(false);
                      expect(Number.isNaN(t.carbohydrate_g)).toBe(false);
                      expect(Number.isNaN(t.fat_g)).toBe(false);

                      // Invariante 4: Nenhum macro negativo
                      expect(t.protein_g).toBeGreaterThanOrEqual(0);
                      expect(t.carbohydrate_g).toBeGreaterThanOrEqual(0);
                      expect(t.fat_g).toBeGreaterThanOrEqual(0);
                      expect(t.protein_kcal).toBeGreaterThanOrEqual(0);
                      expect(t.carbohydrate_kcal).toBeGreaterThanOrEqual(0);
                      expect(t.fat_kcal).toBeGreaterThanOrEqual(0);

                      // Invariante 5: Conservação Termodinâmica de Energia (4*P + 4*C + 9*F = Nominal +- 3.5 kcal)
                      const macroKcal = t.protein_kcal + t.carbohydrate_kcal + t.fat_kcal;
                      const delta = Math.abs(macroKcal - t.target_calories_nominal_kcal);
                      expect(delta).toBeLessThanOrEqual(3.5);

                      // Invariante 6: Faixas calóricas válidas (min <= nominal <= max)
                      expect(t.target_calories_min_kcal).toBeLessThanOrEqual(
                        t.target_calories_nominal_kcal
                      );
                      expect(t.target_calories_nominal_kcal).toBeLessThanOrEqual(
                        t.target_calories_max_kcal
                      );

                      // Invariante 7: Orçamento normalizado não-negativo
                      expect(t.normalized_daily_budget).toBeGreaterThanOrEqual(0);
                      expect(t.normalized_weekly_budget).toBeGreaterThanOrEqual(0);
                      expect(t.normalized_monthly_budget).toBeGreaterThanOrEqual(0);

                      // Invariante 8: Estratégia de peso de referência consistente
                      const heightM = height / 100;
                      const bmi = weight / (heightM * heightM);
                      if (bmi >= 30) {
                        expect(t.macro_reference_weight_strategy).toBe('adjusted_weight');
                        expect(t.macro_reference_weight_kg).toBeLessThan(weight);
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }

      expect(executedCases).toBe(16200);
    },
    60000
  );
});
