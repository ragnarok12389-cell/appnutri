import { describe, it, expect } from 'vitest';
import { runWorkoutComposer } from '@/lib/workout-engine/engine';
import { createMockComposerInput } from './fixtures/workout_fixtures';
import { calculateExerciseOrderScore } from '@/lib/workout-engine/solver';
import { CURATED_EXERCISE_CATALOG } from '@/lib/workout-engine/catalog';
import {
  SECONDARY_MUSCLE_VOLUME_COEFFICIENT,
  OPERATIONAL_VOLUME_HEURISTICS,
} from '@/lib/workout-engine/config';

describe('ETAPA 7: Motor Determinístico de Treino — Matemática e Volume', () => {
  it('deve prescrever faixas de repetições e descanso corretas para hipertrofia', () => {
    const input = createMockComposerInput({
      objective: 'hypertrophy',
      experience_level: 'intermediate',
      sessions_per_week: 4,
    });

    const result = runWorkoutComposer(input);
    expect(result.success).toBe(true);
    expect(result.program).toBeDefined();

    const program = result.program!;
    const trainingDays = program.days.filter((d) => !d.is_rest_day);
    expect(trainingDays.length).toBe(4);

    for (const day of trainingDays) {
      for (const session of day.sessions) {
        expect(session.exercises.length).toBeGreaterThanOrEqual(4);
        for (const ex of session.exercises) {
          expect(ex.prescribed_sets).toBe(3); // intermediate = 3 sets
          if (ex.movement_pattern === 'isolation' || ex.movement_pattern === 'core') {
            expect(ex.min_reps).toBeGreaterThanOrEqual(10);
            expect(ex.rest_seconds).toBeLessThanOrEqual(60);
          } else {
            expect(ex.min_reps).toBe(8);
            expect(ex.max_reps).toBe(12);
            expect(ex.rest_seconds).toBe(90);
          }
        }
      }
    }
  });

  it('deve prescrever faixas de repetições baixas e descanso longo para strength_foundation', () => {
    const input = createMockComposerInput({
      objective: 'strength_foundation',
      experience_level: 'intermediate',
      sessions_per_week: 3,
    });

    const result = runWorkoutComposer(input);
    expect(result.success).toBe(true);
    const program = result.program!;

    const trainingDays = program.days.filter((d) => !d.is_rest_day);
    for (const day of trainingDays) {
      for (const session of day.sessions) {
        const compoundEx = session.exercises.find((e) => e.movement_pattern === 'squat' || e.movement_pattern === 'push_horizontal');
        if (compoundEx) {
          expect(compoundEx.min_reps).toBe(5);
          expect(compoundEx.max_reps).toBe(8);
          expect(compoundEx.rest_seconds).toBe(150);
        }
      }
    }
  });

  it('deve aplicar ordenação heurística contínua por scoring determinístico e versionado', () => {
    const input = createMockComposerInput({
      objective: 'hypertrophy',
      experience_level: 'intermediate',
      sessions_per_week: 4,
    });

    const result = runWorkoutComposer(input);
    expect(result.success).toBe(true);
    const program = result.program!;

    for (const day of program.days.filter((d) => !d.is_rest_day)) {
      for (const session of day.sessions) {
        let previousScore = Infinity;
        for (const ex of session.exercises) {
          const catalogEx = CURATED_EXERCISE_CATALOG.find((c) => c.id === ex.exercise_id);
          expect(catalogEx).toBeDefined();
          const score = calculateExerciseOrderScore(catalogEx!, 'hypertrophy', input.constraints);
          // O escore de ordenação deve ser não crescente (maior pontuação executada primeiro)
          expect(score).toBeLessThanOrEqual(previousScore + 0.0001);
          previousScore = score;
        }
      }
    }
  });

  it('deve prescrever 4 séries por exercício para nível advanced', () => {
    const input = createMockComposerInput({
      experience_level: 'advanced',
      sessions_per_week: 3,
    });

    const result = runWorkoutComposer(input);
    expect(result.success).toBe(true);
    const program = result.program!;

    for (const day of program.days.filter((d) => !d.is_rest_day)) {
      for (const session of day.sessions) {
        for (const ex of session.exercises) {
          expect(ex.prescribed_sets).toBe(4);
        }
      }
    }
  });

  it('deve evitar double counting de volume em músculos secundários com coeficiente fracionário documentado', () => {
    // Coeficiente operacional estruturado = 0.5 (músculos secundários contam 0.5 set)
    expect(SECONDARY_MUSCLE_VOLUME_COEFFICIENT).toBe(0.5);
    expect(OPERATIONAL_VOLUME_HEURISTICS.beginner.min_sets_per_muscle_week).toBe(8);
    expect(OPERATIONAL_VOLUME_HEURISTICS.beginner.max_sets_per_muscle_week).toBe(10);
    expect(OPERATIONAL_VOLUME_HEURISTICS.intermediate.min_sets_per_muscle_week).toBe(12);
    expect(OPERATIONAL_VOLUME_HEURISTICS.intermediate.max_sets_per_muscle_week).toBe(16);
    expect(OPERATIONAL_VOLUME_HEURISTICS.advanced.min_sets_per_muscle_week).toBe(16);
    expect(OPERATIONAL_VOLUME_HEURISTICS.advanced.max_sets_per_muscle_week).toBe(20);
  });
});
