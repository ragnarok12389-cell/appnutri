import { describe, it, expect } from 'vitest';
import { runWorkoutComposer } from '@/lib/workout-engine/engine';
import { createMockComposerInput } from './fixtures/workout_fixtures';
import { filterCandidateExercises } from '@/lib/workout-engine/candidate-filter';
import { CURATED_EXERCISE_CATALOG } from '@/lib/workout-engine/catalog';

describe('ETAPA 7: Motor Determinístico de Treino — Hard Constraints, Sintomas vs Diagnósticos e Soft Preferences', () => {
  it('deve eliminar completamente exercícios recusados pelo paciente (Hard Constraint)', () => {
    const refusedId = 'ex-squat-001'; // Agachamento Livre com Barra
    const input = createMockComposerInput({
      objective: 'hypertrophy',
      sessions_per_week: 3,
      constraints: {
        available_equipment: ['barbell', 'dumbbell', 'cable', 'machine', 'bench', 'pull_up_bar', 'bodyweight'],
        favorite_exercises: [],
        exercises_refused: [refusedId],
        movement_contraindications: [],
      },
    });

    const result = runWorkoutComposer(input);
    expect(result.success).toBe(true);
    const program = result.program!;

    for (const day of program.days) {
      for (const session of day.sessions) {
        for (const ex of session.exercises) {
          expect(ex.exercise_id).not.toBe(refusedId);
        }
      }
    }
  });

  it('deve restringir estritamente aos equipamentos disponíveis (Home Gym com halteres apenas)', () => {
    const input = createMockComposerInput({
      objective: 'general_fitness',
      sessions_per_week: 3,
      constraints: {
        available_equipment: ['dumbbell', 'bench', 'bodyweight'],
        favorite_exercises: [],
        exercises_refused: [],
        movement_contraindications: [],
      },
    });

    const result = runWorkoutComposer(input);
    expect(result.success).toBe(true);
    const program = result.program!;

    for (const day of program.days) {
      for (const session of day.sessions) {
        for (const ex of session.exercises) {
          const catalogItem = CURATED_EXERCISE_CATALOG.find((c) => c.id === ex.exercise_id);
          expect(catalogItem).toBeDefined();
          // Todo equipamento exigido deve estar em ['dumbbell', 'bench', 'bodyweight']
          for (const eq of catalogItem!.required_equipment) {
            expect(['dumbbell', 'bench', 'bodyweight']).toContain(eq);
          }
        }
      }
    }
  });

  it('deve respeitar restrições explícitas de movimento (ex: avoid_overhead_movement) sem inferir diagnósticos clínicos', () => {
    const input = createMockComposerInput({
      objective: 'hypertrophy',
      sessions_per_week: 4,
      constraints: {
        available_equipment: ['barbell', 'dumbbell', 'cable', 'machine', 'bench', 'pull_up_bar', 'bodyweight'],
        favorite_exercises: [],
        exercises_refused: [],
        movement_contraindications: ['avoid_overhead_movement'],
        explicit_movement_restrictions: ['avoid_overhead_movement'],
      },
    });

    const result = runWorkoutComposer(input);
    expect(result.success).toBe(true);
    const program = result.program!;

    for (const day of program.days) {
      for (const session of day.sessions) {
        for (const ex of session.exercises) {
          const catalogItem = CURATED_EXERCISE_CATALOG.find((c) => c.id === ex.exercise_id);
          expect(catalogItem?.safety_contraindications).not.toContain('avoid_overhead_movement');
          // Os desenvolvimentos com barra/halteres/máquina acima da cabeça foram bloqueados
          expect(['ex-push-v-001', 'ex-push-v-002', 'ex-push-v-003']).not.toContain(ex.exercise_id);
        }
      }
    }
  });

  it('deve aplicar princípio SYMPTOM != AUTOMATIC DIAGNOSIS: sintoma relatado não gera diagnóstico mas dispara review_required', () => {
    const input = createMockComposerInput({
      objective: 'hypertrophy',
      sessions_per_week: 3,
      constraints: {
        available_equipment: ['barbell', 'dumbbell', 'cable', 'machine', 'bench', 'pull_up_bar', 'bodyweight'],
        favorite_exercises: [],
        exercises_refused: [],
        movement_contraindications: [],
        // Sintoma relatado pelo praticante (ex: desconforto no ombro durante o dia a dia)
        has_unassessed_clinical_symptoms: true,
        unassessed_symptoms_description: 'Desconforto difuso na cintura escapular direita',
      },
    });

    const result = runWorkoutComposer(input);
    expect(result.success).toBe(true);
    const program = result.program!;

    // SYMPTOM != AUTOMATIC DIAGNOSIS:
    // O motor NÃO infere diagnóstico médico por conta própria, mas marca com review_required
    expect(program.generation_status).toBe('review_required');
    expect(program.approval_status).toBe('draft');
    expect(program.is_active).toBe(false);
  });

  it('deve priorizar exercício favorito via pontuação multiobjetivo (Soft Preference)', () => {
    const favId = 'ex-push-h-002'; // Supino com Halteres
    const inputWithFav = createMockComposerInput({
      objective: 'hypertrophy',
      sessions_per_week: 4,
      constraints: {
        available_equipment: ['barbell', 'dumbbell', 'bench'],
        favorite_exercises: [favId],
        exercises_refused: [],
        movement_contraindications: [],
      },
    });

    const result = runWorkoutComposer(inputWithFav);
    expect(result.success).toBe(true);
    const program = result.program!;

    let foundFav = false;
    for (const day of program.days) {
      for (const session of day.sessions) {
        if (session.exercises.some((e) => e.exercise_id === favId)) {
          foundFav = true;
        }
      }
    }
    expect(foundFav).toBe(true);
  });

  it('deve aplicar princípio UNKNOWN != SAFE: exercício com equipamento indefinido é rejeitado', () => {
    const malformedCatalog = [
      ...CURATED_EXERCISE_CATALOG,
      {
        id: 'ex-unknown-001',
        code: 'UNKNOWN_EQUIPMENT_EXERCISE',
        name: 'Exercício Desconhecido',
        normalized_name: 'exercicio desconhecido',
        aliases: [],
        movement_pattern: 'squat' as const,
        primary_muscle_groups: ['quadriceps' as const],
        secondary_muscle_groups: [],
        required_equipment: [], // Sem equipamento especificado
        complexity_level: 'beginner' as const,
        is_unilateral: false,
        is_compound: true,
        safety_contraindications: [],
        instructions: '',
        source_version: '1.0.0',
        provenance: 'test_provenance',
        is_active: true,
      },
    ];

    const { eligible, rejectedMap } = filterCandidateExercises(
      malformedCatalog,
      {
        available_equipment: ['barbell', 'dumbbell'],
        favorite_exercises: [],
        exercises_refused: [],
        movement_contraindications: [],
      },
      'intermediate'
    );

    expect(eligible.some((e) => e.id === 'ex-unknown-001')).toBe(false);
    expect(rejectedMap.get('ex-unknown-001')).toContain('EQUIPMENT_UNSPECIFIED');
  });
});
