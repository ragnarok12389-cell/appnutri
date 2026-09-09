/**
 * Fixtures Reutilizáveis para Testes do Motor de Treino (ETAPA 7)
 */

import {
  WorkoutObjective,
  WorkoutExperienceLevel,
  WorkoutConstraints,
  WorkoutComposerInput,
  Exercise,
} from '@/types/workout-engine';
import { CURATED_EXERCISE_CATALOG } from '@/lib/workout-engine/catalog';

export const SAMPLE_EXERCISE_CATALOG: Exercise[] = CURATED_EXERCISE_CATALOG;

export function createMockConstraints(overrides: Partial<WorkoutConstraints> = {}): WorkoutConstraints {
  return {
    available_equipment: [
      'barbell',
      'dumbbell',
      'cable',
      'machine',
      'bench',
      'pull_up_bar',
      'bodyweight',
    ],
    favorite_exercises: [],
    exercises_refused: [],
    movement_contraindications: [],
    ...overrides,
  };
}

export function createMockComposerInput(
  overrides: Partial<WorkoutComposerInput> = {}
): WorkoutComposerInput {
  return {
    patient_id: '00000000-0000-0000-0000-000000000001',
    objective: 'hypertrophy' as WorkoutObjective,
    experience_level: 'intermediate' as WorkoutExperienceLevel,
    sessions_per_week: 4,
    session_duration_minutes: 60,
    constraints: createMockConstraints(),
    catalog: SAMPLE_EXERCISE_CATALOG,
    source_profile_version: 1,
    generation_reference_at: '2026-09-09T00:00:00.000Z',
    ...overrides,
  };
}
