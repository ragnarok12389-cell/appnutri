import { describe, it, expect } from 'vitest';
import { evaluateDoubleProgression } from '@/lib/workout-engine/progression';

describe('ETAPA 7: Motor Determinístico de Treino — Double Progression & Incrementos Estruturados', () => {
  it('deve aplicar incremento estruturado em kg quando o equipamento for barra com anilhas conhecidas (+2.5kg)', () => {
    const evaluation = evaluateDoubleProgression({
      exercise_id: 'ex-squat-001',
      required_equipment: ['barbell'],
      prescribed_sets: 3,
      min_reps: 8,
      max_reps: 12,
      target_rir: 2,
      equipment_increment_value: 2.5,
      equipment_increment_unit: 'kg',
      recent_logs: [
        // Sessão 1 (2026-09-01) - Todas as 3 séries bateram 12 reps com RIR 2
        { session_date: '2026-09-01', set_number: 1, weight: 80, unit: 'kg', reps_completed: 12, actual_rir: 2 },
        { session_date: '2026-09-01', set_number: 2, weight: 80, unit: 'kg', reps_completed: 12, actual_rir: 2 },
        { session_date: '2026-09-01', set_number: 3, weight: 80, unit: 'kg', reps_completed: 12, actual_rir: 2 },
        // Sessão 2 (2026-09-05) - Todas as 3 séries bateram 12 reps com RIR 2
        { session_date: '2026-09-05', set_number: 1, weight: 80, unit: 'kg', reps_completed: 12, actual_rir: 2 },
        { session_date: '2026-09-05', set_number: 2, weight: 80, unit: 'kg', reps_completed: 12, actual_rir: 2 },
        { session_date: '2026-09-05', set_number: 3, weight: 80, unit: 'kg', reps_completed: 12, actual_rir: 2 },
      ],
    });

    expect(evaluation.should_increase_load).toBe(true);
    expect(evaluation.progression_type).toBe('absolute_load_increase');
    expect(evaluation.reason_code).toBe('DOUBLE_PROGRESSION_CEILING_ACHIEVED');
    expect(evaluation.current_weight).toBe(80);
    expect(evaluation.unit).toBe('kg');
    expect(evaluation.recommended_increment).toBe(2.5);
    expect(evaluation.recommended_weight).toBe(82.5);
  });

  it('deve suportar incrementos estruturados em libras (lb) sem assumir kg universal', () => {
    const evaluation = evaluateDoubleProgression({
      exercise_id: 'ex-push-h-002',
      required_equipment: ['dumbbell'],
      prescribed_sets: 3,
      min_reps: 8,
      max_reps: 12,
      target_rir: 2,
      equipment_increment_value: 5.0,
      equipment_increment_unit: 'lb',
      recent_logs: [
        { session_date: '2026-09-01', set_number: 1, weight: 50, unit: 'lb', reps_completed: 12, actual_rir: 2 },
        { session_date: '2026-09-01', set_number: 2, weight: 50, unit: 'lb', reps_completed: 12, actual_rir: 2 },
        { session_date: '2026-09-01', set_number: 3, weight: 50, unit: 'lb', reps_completed: 12, actual_rir: 2 },
        { session_date: '2026-09-05', set_number: 1, weight: 50, unit: 'lb', reps_completed: 12, actual_rir: 2 },
        { session_date: '2026-09-05', set_number: 2, weight: 50, unit: 'lb', reps_completed: 12, actual_rir: 2 },
        { session_date: '2026-09-05', set_number: 3, weight: 50, unit: 'lb', reps_completed: 12, actual_rir: 2 },
      ],
    });

    expect(evaluation.should_increase_load).toBe(true);
    expect(evaluation.progression_type).toBe('absolute_load_increase');
    expect(evaluation.current_weight).toBe(50);
    expect(evaluation.unit).toBe('lb');
    expect(evaluation.recommended_increment).toBe(5.0);
    expect(evaluation.recommended_weight).toBe(55.0);
  });

  it('NÃO deve inventar kg/lb quando o incremento do equipamento for desconhecido', () => {
    const evaluation = evaluateDoubleProgression({
      exercise_id: 'ex-cable-001',
      required_equipment: ['cable'],
      prescribed_sets: 3,
      min_reps: 10,
      max_reps: 15,
      target_rir: 2,
      // Incremento do equipamento desconhecido (ex: máquina de placas sem demarcação)
      equipment_increment_value: null,
      equipment_increment_unit: 'kg',
      recent_logs: [
        { session_date: '2026-09-01', set_number: 1, weight: 35, unit: 'kg', reps_completed: 15, actual_rir: 2 },
        { session_date: '2026-09-01', set_number: 2, weight: 35, unit: 'kg', reps_completed: 15, actual_rir: 2 },
        { session_date: '2026-09-01', set_number: 3, weight: 35, unit: 'kg', reps_completed: 15, actual_rir: 2 },
        { session_date: '2026-09-05', set_number: 1, weight: 35, unit: 'kg', reps_completed: 15, actual_rir: 2 },
        { session_date: '2026-09-05', set_number: 2, weight: 35, unit: 'kg', reps_completed: 15, actual_rir: 2 },
        { session_date: '2026-09-05', set_number: 3, weight: 35, unit: 'kg', reps_completed: 15, actual_rir: 2 },
      ],
    });

    expect(evaluation.should_increase_load).toBe(true);
    // NÃO inventar valor absoluto!
    expect(evaluation.recommended_increment).toBeNull();
    expect(evaluation.recommended_weight).toBeNull();
    expect(evaluation.progression_type).toBe('unquantified_load_increase');
    expect(evaluation.reason_code).toBe('DOUBLE_PROGRESSION_CEILING_ACHIEVED');
    expect(evaluation.details).toContain('não possui incremento cadastrado');
  });

  it('deve recomendar consolidação de repetições quando a última série não atingir o teto', () => {
    const evaluation = evaluateDoubleProgression({
      exercise_id: 'ex-squat-001',
      required_equipment: ['barbell'],
      prescribed_sets: 3,
      min_reps: 8,
      max_reps: 12,
      target_rir: 2,
      equipment_increment_value: 2.5,
      equipment_increment_unit: 'kg',
      recent_logs: [
        { session_date: '2026-09-01', set_number: 1, weight: 80, unit: 'kg', reps_completed: 12, actual_rir: 2 },
        { session_date: '2026-09-01', set_number: 2, weight: 80, unit: 'kg', reps_completed: 12, actual_rir: 2 },
        { session_date: '2026-09-01', set_number: 3, weight: 80, unit: 'kg', reps_completed: 12, actual_rir: 2 },
        // Na sessão 2, fez 12, 11, 10 reps (não consolidou o teto)
        { session_date: '2026-09-05', set_number: 1, weight: 80, unit: 'kg', reps_completed: 12, actual_rir: 2 },
        { session_date: '2026-09-05', set_number: 2, weight: 80, unit: 'kg', reps_completed: 11, actual_rir: 2 },
        { session_date: '2026-09-05', set_number: 3, weight: 80, unit: 'kg', reps_completed: 10, actual_rir: 2 },
      ],
    });

    expect(evaluation.should_increase_load).toBe(false);
    expect(evaluation.progression_type).toBe('consolidate');
    expect(evaluation.reason_code).toBe('CONSOLIDATE_REPS');
    expect(evaluation.recommended_weight).toBeNull();
    expect(evaluation.current_weight).toBe(80);
  });

  it('deve retornar INSUFFICIENT_HISTORY quando houver apenas 1 sessão registrada', () => {
    const evaluation = evaluateDoubleProgression({
      exercise_id: 'ex-squat-001',
      required_equipment: ['barbell'],
      prescribed_sets: 3,
      min_reps: 8,
      max_reps: 12,
      target_rir: 2,
      equipment_increment_value: 2.5,
      equipment_increment_unit: 'kg',
      recent_logs: [
        { session_date: '2026-09-01', set_number: 1, weight: 80, unit: 'kg', reps_completed: 12, actual_rir: 2 },
        { session_date: '2026-09-01', set_number: 2, weight: 80, unit: 'kg', reps_completed: 12, actual_rir: 2 },
        { session_date: '2026-09-01', set_number: 3, weight: 80, unit: 'kg', reps_completed: 12, actual_rir: 2 },
      ],
    });

    expect(evaluation.should_increase_load).toBe(false);
    expect(evaluation.progression_type).toBe('consolidate');
    expect(evaluation.reason_code).toBe('INSUFFICIENT_HISTORY');
    expect(evaluation.recommended_weight).toBeNull();
    expect(evaluation.current_weight).toBe(80);
  });
});
