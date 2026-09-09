/**
 * Fórmula de Taxa Metabólica Basal (BMR / TMB): Mifflin-St Jeor (1990)
 * 
 * Homens:   10 * peso(kg) + 6.25 * altura(cm) - 5 * idade(anos) + 5
 * Mulheres: 10 * peso(kg) + 6.25 * altura(cm) - 5 * idade(anos) - 161
 */

export interface MifflinStJeorInput {
  weight_kg: number;
  height_cm: number;
  age_years: number;
  biological_sex: 'male' | 'female';
}

export interface BmrCalculationResult {
  formula: 'mifflin_st_jeor';
  formula_version: string;
  bmr_kcal: number;
}

export function calculateMifflinStJeor(input: MifflinStJeorInput): BmrCalculationResult {
  const { weight_kg, height_cm, age_years, biological_sex } = input;

  if (weight_kg <= 0 || height_cm <= 0 || age_years <= 0) {
    throw new Error('Parâmetros biométricos inválidos para o cálculo de BMR.');
  }

  const base = 10 * weight_kg + 6.25 * height_cm - 5 * age_years;
  const sexAdjustment = biological_sex === 'male' ? 5 : -161;
  const bmr_kcal = Math.round((base + sexAdjustment) * 100) / 100;

  return {
    formula: 'mifflin_st_jeor',
    formula_version: '1.0.0',
    bmr_kcal,
  };
}

/**
 * Calcula a idade em anos completos a partir de uma string de data (YYYY-MM-DD).
 */
export function calculateAgeInYears(birthDateStr: string, referenceDate: Date = new Date()): number {
  const birthDate = new Date(birthDateStr);
  if (isNaN(birthDate.getTime())) {
    throw new Error('Data de nascimento inválida.');
  }

  let age = referenceDate.getFullYear() - birthDate.getFullYear();
  const m = referenceDate.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && referenceDate.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
}
