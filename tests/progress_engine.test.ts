import { describe, expect, it } from 'vitest';
import { analyzeProgress } from '@/lib/progress-engine/engine';
import { ProgressAnalysisInput, ProgressCheckIn } from '@/types/progress';
import { CheckInInputSchema } from '@/types/progress';

function checkIn(id: string, date: string, values: Partial<ProgressCheckIn> = {}): ProgressCheckIn {
  return {
    id,
    patient_id: '11111111-1111-4111-a111-111111111111',
    check_in_date: date,
    concerning_symptoms: false,
    created_at: `${date}T12:00:00.000Z`,
    ...values,
  };
}

function input(overrides: Partial<ProgressAnalysisInput> = {}): ProgressAnalysisInput {
  return {
    patient_id: '11111111-1111-4111-a111-111111111111',
    window_start: '2026-08-13',
    window_end: '2026-09-09',
    check_ins: [],
    workout_session_dates: [],
    feedback_events: [],
    ...overrides,
  };
}

describe('ETAPA 9: motor determinístico de progresso', () => {
  it('produz os mesmos hashes independentemente da ordem das entradas', () => {
    const first = checkIn('aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', '2026-09-01', { weight_kg: 80 });
    const second = checkIn('bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb', '2026-09-08', { weight_kg: 79.2 });

    const resultA = analyzeProgress(input({ check_ins: [first, second], workout_session_dates: ['2026-09-08', '2026-09-01'] }));
    const resultB = analyzeProgress(input({ check_ins: [second, first], workout_session_dates: ['2026-09-01', '2026-09-08', '2026-09-08'] }));

    expect(resultA.input_hash).toBe(resultB.input_hash);
    expect(resultA.output_hash).toBe(resultB.output_hash);
    expect(resultA.metrics.weight_change_kg).toBe(-0.8);
  });

  it('abre proposta nutricional sem prescrever novo alvo quando a fome é recorrente', () => {
    const result = analyzeProgress(input({
      check_ins: [
        checkIn('aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', '2026-09-01', { hunger_level: 4 }),
        checkIn('bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb', '2026-09-08', { hunger_level: 5 }),
      ],
    }));

    expect(result.reason_codes).toContain('RECURRING_HIGH_HUNGER');
    expect(result.proposals).toContainEqual(expect.objectContaining({
      domain: 'nutrition',
      proposal_type: 'review_meal_satiety',
    }));
    expect(JSON.stringify(result)).not.toMatch(/target_calories|recommended_calories/);
  });

  it('encaminha desconforto recorrente sem diagnosticar', () => {
    const result = analyzeProgress(input({
      feedback_events: [
        { id: '1', feedback_type: 'exercise_discomfort', domain: 'workout', created_at: '2026-09-01T00:00:00Z' },
        { id: '2', feedback_type: 'exercise_discomfort', domain: 'workout', created_at: '2026-09-08T00:00:00Z' },
      ],
    }));

    expect(result.reason_codes).toContain('RECURRING_EXERCISE_DISCOMFORT');
    expect(result.proposals[0]).toEqual(expect.objectContaining({ priority: 'high', domain: 'workout' }));
    expect(result.proposals[0].summary).not.toMatch(/diagnóstico|lesão|patologia/i);
  });

  it('trata ausência de dados como insuficiente', () => {
    const result = analyzeProgress(input());
    expect(result.data_quality).toBe('insufficient');
    expect(result.reason_codes).toContain('INSUFFICIENT_CHECK_IN_DATA');
    expect(result.metrics.weight_change_kg).toBeNull();
  });

  it('muda os hashes quando o conteúdo semântico muda', () => {
    const base = input({ check_ins: [checkIn('aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', '2026-09-01', { energy_level: 3 })] });
    const changed = input({ check_ins: [checkIn('aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', '2026-09-01', { energy_level: 4 })] });
    expect(analyzeProgress(base).input_hash).not.toBe(analyzeProgress(changed).input_hash);
    expect(analyzeProgress(base).output_hash).not.toBe(analyzeProgress(changed).output_hash);
  });

  it('rejeita check-in vazio e escalas fora do domínio', () => {
    expect(CheckInInputSchema.safeParse({ check_in_date: '2026-09-09' }).success).toBe(false);
    expect(CheckInInputSchema.safeParse({ check_in_date: '2026-09-09', hunger_level: 6 }).success).toBe(false);
    expect(CheckInInputSchema.safeParse({ check_in_date: '2026-09-09', weight_kg: 80 }).success).toBe(true);
  });
});
