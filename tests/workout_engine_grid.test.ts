import { describe, it, expect } from 'vitest';
import { runWorkoutComposer } from '@/lib/workout-engine/engine';
import { createMockComposerInput } from './fixtures/workout_fixtures';
import { WorkoutObjective, WorkoutExperienceLevel } from '@/types/workout-engine';

describe('ETAPA 7: Motor Determinístico de Treino — Grid Combinatório (75 Cenários)', () => {
  const objectives: WorkoutObjective[] = [
    'hypertrophy',
    'general_fitness',
    'strength_foundation',
    'weight_loss_support',
    'conditioning_foundation',
  ];

  const experienceLevels: WorkoutExperienceLevel[] = [
    'beginner',
    'intermediate',
    'advanced',
  ];

  const frequencies = [2, 3, 4, 5, 6];

  it('deve gerar programas válidos e manter invariantes em todos os 75 cenários combinatórios', () => {
    let scenarioCount = 0;

    for (const objective of objectives) {
      for (const level of experienceLevels) {
        for (const freq of frequencies) {
          scenarioCount++;
          const input = createMockComposerInput({
            objective,
            experience_level: level,
            sessions_per_week: freq,
          });

          const result = runWorkoutComposer(input);

          expect(result.success, `Falha no cenário ${objective} x ${level} x ${freq}d`).toBe(true);
          expect(result.program).toBeDefined();

          const program = result.program!;
          expect(program.objective).toBe(objective);
          expect(program.experience_level).toBe(level);
          expect(program.sessions_per_week).toBe(freq);

          // Verificar dias de treino
          const trainingDays = program.days.filter((d) => !d.is_rest_day);
          expect(trainingDays.length).toBe(freq);

          // Hashes SHA-256 válidos
          expect(program.input_snapshot_hash).toMatch(/^[a-f0-9]{64}$/);
          expect(program.output_program_hash).toMatch(/^[a-f0-9]{64}$/);

          // Invariantes dos exercícios
          for (const day of trainingDays) {
            expect(day.sessions.length).toBe(1);
            const session = day.sessions[0];
            expect(session.exercises.length).toBeGreaterThanOrEqual(3);

            for (const ex of session.exercises) {
              expect(ex.prescribed_sets).toBeGreaterThanOrEqual(3);
              expect(ex.min_reps).toBeGreaterThanOrEqual(5);
              expect(ex.max_reps).toBeGreaterThanOrEqual(ex.min_reps);
              expect(ex.rest_seconds).toBeGreaterThanOrEqual(30);
              expect(Number.isNaN(ex.min_reps)).toBe(false);
              expect(Number.isNaN(ex.max_reps)).toBe(false);
              expect(Number.isNaN(ex.prescribed_sets)).toBe(false);
            }
          }
        }
      }
    }

    expect(scenarioCount).toBe(75);
  });
});
