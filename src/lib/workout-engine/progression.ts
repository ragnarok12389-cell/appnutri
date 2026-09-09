/**
 * Motor Determinístico de Progressão de Treino (ETAPA 7)
 * Implementação da regra de Double Progression dependente do incremento do equipamento.
 * NÃO inventa valores de kg/lb quando o incremento do equipamento for desconhecido.
 * Suporta explicitamente unidades 'kg' e 'lb'.
 * Versionado e auditável (WORKOUT_ENGINE_VERSION = '1.0.0').
 */

import { EquipmentType, ProgressionUnit } from '@/types/workout-engine';

export interface ExecutionLogEntry {
  session_date: string;
  set_number: number;
  weight: number;
  unit?: ProgressionUnit;
  reps_completed: number;
  actual_rir?: number | null;
}

export interface ProgressionEvaluationInput {
  exercise_id: string;
  required_equipment: EquipmentType[];
  prescribed_sets: number;
  min_reps: number;
  max_reps: number;
  target_rir: number | null;
  equipment_increment_value?: number | null; // Incremento específico do equipamento (ex: 2.5kg, 5lb)
  equipment_increment_unit?: ProgressionUnit; // 'kg' ou 'lb'
  recent_logs: ExecutionLogEntry[]; // Histórico recente ordenado cronologicamente ASC
}

export interface ProgressionRecommendation {
  exercise_id: string;
  should_increase_load: boolean;
  current_weight: number;
  unit: ProgressionUnit;
  recommended_increment: number | null; // null se incremento do equipamento for desconhecido
  recommended_weight: number | null;    // null se incremento do equipamento for desconhecido
  progression_type: 'absolute_load_increase' | 'unquantified_load_increase' | 'consolidate';
  reason_code: 'DOUBLE_PROGRESSION_CEILING_ACHIEVED' | 'CONSOLIDATE_REPS' | 'INSUFFICIENT_HISTORY';
  details: string;
}

/**
 * Avalia deterministicamente a progressão de carga segundo a regra de Double Progression.
 * Se o incremento for conhecido: retorna o valor exato na unidade correta.
 * Se o incremento for desconhecido: NÃO inventa carga; retorna recomendação desprovida de número ad-hoc.
 */
export function evaluateDoubleProgression(
  input: ProgressionEvaluationInput
): ProgressionRecommendation {
  const {
    exercise_id,
    prescribed_sets,
    max_reps,
    target_rir,
    equipment_increment_value,
    equipment_increment_unit = 'kg',
    recent_logs,
  } = input;

  // Agrupar logs por data de sessão
  const sessionMap = new Map<string, ExecutionLogEntry[]>();
  for (const log of recent_logs) {
    const existing = sessionMap.get(log.session_date) ?? [];
    existing.push(log);
    sessionMap.set(log.session_date, existing);
  }

  const sessionDates = Array.from(sessionMap.keys()).sort();

  if (sessionDates.length < 2) {
    const lastSession = sessionDates.length === 1 ? sessionMap.get(sessionDates[0]) : null;
    const lastWeight = lastSession && lastSession[0] ? lastSession[0].weight : 0.0;
    const lastUnit = (lastSession && lastSession[0]?.unit) || equipment_increment_unit;

    return {
      exercise_id,
      should_increase_load: false,
      current_weight: lastWeight,
      unit: lastUnit,
      recommended_increment: null,
      recommended_weight: null,
      progression_type: 'consolidate',
      reason_code: 'INSUFFICIENT_HISTORY',
      details: 'Necessário histórico de pelo menos 2 sessões registradas para validar progressão determinística.',
    };
  }

  // Avaliar as últimas duas sessões consecutivas
  const lastTwoDates = sessionDates.slice(-2);
  let bothSessionsQualified = true;
  let latestWeight = 0.0;
  let resolvedUnit: ProgressionUnit = equipment_increment_unit;

  for (const date of lastTwoDates) {
    const setsForDate = sessionMap.get(date) ?? [];
    if (setsForDate.length < prescribed_sets) {
      bothSessionsQualified = false;
      break;
    }

    for (const setLog of setsForDate.slice(0, prescribed_sets)) {
      latestWeight = setLog.weight;
      if (setLog.unit) {
        resolvedUnit = setLog.unit;
      }
      if (setLog.reps_completed < max_reps) {
        bothSessionsQualified = false;
        break;
      }
      if (
        target_rir !== null &&
        setLog.actual_rir !== undefined &&
        setLog.actual_rir !== null &&
        setLog.actual_rir < target_rir - 1
      ) {
        bothSessionsQualified = false;
        break;
      }
    }

    if (!bothSessionsQualified) break;
  }

  if (bothSessionsQualified) {
    // Se o incremento do equipamento for conhecido e maior que zero
    if (typeof equipment_increment_value === 'number' && equipment_increment_value > 0) {
      return {
        exercise_id,
        should_increase_load: true,
        current_weight: latestWeight,
        unit: resolvedUnit,
        recommended_increment: equipment_increment_value,
        recommended_weight: latestWeight + equipment_increment_value,
        progression_type: 'absolute_load_increase',
        reason_code: 'DOUBLE_PROGRESSION_CEILING_ACHIEVED',
        details: `Critério de Double Progression atingido em 2 sessões consecutivas (${max_reps} reps). Recomenda-se incremento de +${equipment_increment_value}${resolvedUnit} baseado no incremento conhecido do equipamento.`,
      };
    }

    // Se o incremento do equipamento for DESCONHECIDO: NÃO INVENTAR VALOR
    return {
      exercise_id,
      should_increase_load: true,
      current_weight: latestWeight,
      unit: resolvedUnit,
      recommended_increment: null,
      recommended_weight: null,
      progression_type: 'unquantified_load_increase',
      reason_code: 'DOUBLE_PROGRESSION_CEILING_ACHIEVED',
      details: `Critério de Double Progression atingido em 2 sessões consecutivas (${max_reps} reps). Como o equipamento não possui incremento cadastrado, recomenda-se avançar para a menor sobrecarga imediatamente superior disponível.`,
    };
  }

  return {
    exercise_id,
    should_increase_load: false,
    current_weight: latestWeight,
    unit: resolvedUnit,
    recommended_increment: null,
    recommended_weight: null,
    progression_type: 'consolidate',
    reason_code: 'CONSOLIDATE_REPS',
    details: 'Mantenha a carga atual e busque atingir o teto de repetições em todas as séries prescritas antes de progredir.',
  };
}
