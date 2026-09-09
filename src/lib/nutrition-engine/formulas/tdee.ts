import { ACTIVITY_FACTORS } from '../config';

export interface TdeeResult {
  activity_level: string;
  activity_factor: number;
  tdee_kcal: number;
}

/**
 * Calcula o TDEE (Total Daily Energy Expenditure) multiplicando a TMB pelo fator de atividade.
 * NÃO executa fallback silencioso para 'sedentary'.
 * Caso o nível de atividade seja inválido ou desconhecido, lança exceção explícita.
 */
export function calculateTdee(bmr_kcal: number, activityLevel: string): TdeeResult {
  if (!activityLevel || !(activityLevel in ACTIVITY_FACTORS)) {
    throw new Error(
      `Nível de atividade '${activityLevel}' inválido ou desconhecido. Fallbacks silenciosos são proibidos.`
    );
  }

  const factor = ACTIVITY_FACTORS[activityLevel];
  const tdee_kcal = Math.round(bmr_kcal * factor * 100) / 100;

  return {
    activity_level: activityLevel,
    activity_factor: factor,
    tdee_kcal,
  };
}
