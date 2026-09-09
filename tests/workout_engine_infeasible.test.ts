import { describe, it, expect } from 'vitest';
import { runWorkoutComposer } from '@/lib/workout-engine/engine';
import { createMockComposerInput } from './fixtures/workout_fixtures';

describe('ETAPA 7: Motor Determinístico de Treino — Reason Codes e Inviabilidade', () => {
  it('deve retornar FREQUENCY_UNSUPPORTED para frequências fora do intervalo [2..6]', () => {
    const inputUnder = createMockComposerInput({ sessions_per_week: 1 });
    const resUnder = runWorkoutComposer(inputUnder);
    expect(resUnder.success).toBe(false);
    expect(resUnder.generation_status).toBe('infeasible');
    expect(resUnder.infeasible_reason_codes).toContain('FREQUENCY_UNSUPPORTED');

    const inputOver = createMockComposerInput({ sessions_per_week: 7 });
    const resOver = runWorkoutComposer(inputOver);
    expect(resOver.success).toBe(false);
    expect(resOver.generation_status).toBe('infeasible');
    expect(resOver.infeasible_reason_codes).toContain('FREQUENCY_UNSUPPORTED');
  });

  it('deve retornar INSUFFICIENT_EQUIPMENT quando nenhum equipamento for informado', () => {
    const input = createMockComposerInput({
      constraints: {
        available_equipment: [],
        favorite_exercises: [],
        exercises_refused: [],
        movement_contraindications: [],
      },
    });

    const res = runWorkoutComposer(input);
    expect(res.success).toBe(false);
    expect(res.generation_status).toBe('infeasible');
    expect(res.infeasible_reason_codes).toContain('INSUFFICIENT_EQUIPMENT');
  });

  it('deve retornar INSUFFICIENT_PROFILE_DATA quando patient_id estiver ausente', () => {
    const input = createMockComposerInput({ patient_id: '' });
    const res = runWorkoutComposer(input);
    expect(res.success).toBe(false);
    expect(res.generation_status).toBe('infeasible');
    expect(res.infeasible_reason_codes).toContain('INSUFFICIENT_PROFILE_DATA');
  });

  it('deve retornar NO_COMPATIBLE_EXERCISES quando o catálogo elegível for insuficiente', () => {
    // Recusar praticamente todos os exercícios do catálogo
    const allIds = inputCatalogIds();
    const input = createMockComposerInput({
      constraints: {
        available_equipment: ['barbell'],
        favorite_exercises: [],
        exercises_refused: allIds, // Todos recusados
        movement_contraindications: [],
      },
    });

    const res = runWorkoutComposer(input);
    expect(res.success).toBe(false);
    expect(res.generation_status).toBe('infeasible');
    expect(res.infeasible_reason_codes).toContain('NO_COMPATIBLE_EXERCISES');
  });

  it('deve marcar status como REVIEW_REQUIRED e draft quando houver contraindicação grave', () => {
    const input = createMockComposerInput({
      constraints: {
        available_equipment: ['barbell', 'dumbbell', 'machine', 'bench'],
        favorite_exercises: [],
        exercises_refused: [],
        movement_contraindications: ['acute_disc_herniation'],
      },
    });

    const res = runWorkoutComposer(input);
    expect(res.success).toBe(true);
    expect(res.generation_status).toBe('review_required');
    expect(res.program?.approval_status).toBe('draft');
    expect(res.infeasible_reason_codes).toContain('REVIEW_REQUIRED');
  });
});

function inputCatalogIds(): string[] {
  return [
    'ex-squat-001', 'ex-squat-002', 'ex-squat-003', 'ex-squat-004', 'ex-squat-005',
    'ex-hinge-001', 'ex-hinge-002', 'ex-hinge-003', 'ex-hinge-004', 'ex-hinge-005',
    'ex-push-h-001', 'ex-push-h-002', 'ex-push-h-003', 'ex-push-h-004', 'ex-push-h-005',
    'ex-push-v-001', 'ex-push-v-002', 'ex-push-v-003', 'ex-push-v-004', 'ex-push-v-005',
    'ex-pull-h-001', 'ex-pull-h-002', 'ex-pull-h-003', 'ex-pull-h-004',
    'ex-pull-v-001', 'ex-pull-v-002', 'ex-pull-v-003',
    'ex-lunge-001', 'ex-lunge-002', 'ex-lunge-003',
    'ex-carry-001', 'ex-core-001', 'ex-core-002', 'ex-core-003',
    'ex-iso-001', 'ex-iso-002', 'ex-iso-003', 'ex-iso-004', 'ex-iso-005', 'ex-iso-006', 'ex-iso-007', 'ex-iso-008'
  ];
}
