import { describe, it, expect } from 'vitest';
import { getExerciseSubstitutionOptions } from '@/lib/workout-engine/substitution';
import { CURATED_EXERCISE_CATALOG } from '@/lib/workout-engine/catalog';
import { createMockConstraints } from './fixtures/workout_fixtures';

describe('ETAPA 7: Motor Determinístico de Treino — Troca Inteligente de Exercícios', () => {
  it('deve sugerir alternativas biomecânicas válidas para Supino Reto com Barra', () => {
    const original = CURATED_EXERCISE_CATALOG.find((e) => e.code === 'BARBELL_BENCH_PRESS')!;
    expect(original).toBeDefined();

    const constraints = createMockConstraints({
      available_equipment: ['barbell', 'dumbbell', 'cable', 'machine', 'bench', 'bodyweight'],
    });

    const options = getExerciseSubstitutionOptions(original, constraints, CURATED_EXERCISE_CATALOG);

    expect(options.length).toBeGreaterThanOrEqual(2);
    // Deve sugerir Supino com Halteres ou Supino Máquina
    const optionCodes = options.map((o) => {
      const match = CURATED_EXERCISE_CATALOG.find((c) => c.id === o.exercise_id);
      return match?.code;
    });

    expect(optionCodes).toContain('DUMBBELL_BENCH_PRESS');
    expect(optionCodes).toContain('MACHINE_CHEST_PRESS');

    // A primeira opção deve ter alta pontuação de compatibilidade
    expect(options[0].compatibility_score).toBeGreaterThanOrEqual(80);
    expect(options[0].reason_codes).toContain('SAME_MOVEMENT_PATTERN');
    expect(options[0].reason_codes).toContain('SHARED_PRIMARY_MUSCLE_GROUP');
  });

  it('não deve sugerir alternativas que exigem equipamentos indisponíveis', () => {
    const original = CURATED_EXERCISE_CATALOG.find((e) => e.code === 'BARBELL_BACK_SQUAT')!;
    // Paciente só tem halteres e banco
    const constraints = createMockConstraints({
      available_equipment: ['dumbbell', 'bench', 'bodyweight'],
    });

    const options = getExerciseSubstitutionOptions(original, constraints, CURATED_EXERCISE_CATALOG);

    for (const opt of options) {
      for (const eq of opt.required_equipment) {
        expect(['dumbbell', 'bench', 'bodyweight']).toContain(eq);
      }
    }
  });

  it('não deve sugerir alternativas presentes na lista de recusas', () => {
    const original = CURATED_EXERCISE_CATALOG.find((e) => e.code === 'BARBELL_BENCH_PRESS')!;
    const refusedDumbbellBench = 'ex-push-h-002'; // DUMBBELL_BENCH_PRESS

    const constraints = createMockConstraints({
      exercises_refused: [refusedDumbbellBench],
    });

    const options = getExerciseSubstitutionOptions(original, constraints, CURATED_EXERCISE_CATALOG);

    expect(options.some((o) => o.exercise_id === refusedDumbbellBench)).toBe(false);
  });
});
