/**
 * Motor de Troca Inteligente e Substituição Determinística de Exercícios (ETAPA 7)
 * Versionado e auditável (WORKOUT_ENGINE_VERSION = '1.0.0').
 */

import {
  Exercise,
  ExerciseSubstitutionOption,
  WorkoutConstraints,
  WorkoutExperienceLevel,
} from '@/types/workout-engine';
import { filterCandidateExercises } from './candidate-filter';

/**
 * Retorna as alternativas determinísticas e seguras para substituição de um exercício.
 */
export function getExerciseSubstitutionOptions(
  originalExercise: Exercise,
  constraints: WorkoutConstraints,
  catalog: Exercise[],
  experienceLevel: WorkoutExperienceLevel = 'intermediate'
): ExerciseSubstitutionOption[] {
  // 1. Filtrar catálogo respeitando todas as hard constraints do paciente
  const { eligible } = filterCandidateExercises(catalog, constraints, experienceLevel);

  const options: ExerciseSubstitutionOption[] = [];

  for (const candidate of eligible) {
    if (candidate.id === originalExercise.id) continue; // Pular o próprio exercício

    const reasons: string[] = [];
    let compatibilityScore = 0;

    // 2. Mesma dominância / padrão de movimento
    if (candidate.movement_pattern === originalExercise.movement_pattern) {
      compatibilityScore += 50;
      reasons.push('SAME_MOVEMENT_PATTERN');
    }

    // 3. Sobreposição de grupos musculares primários
    const hasSharedPrimary = candidate.primary_muscle_groups.some((m) =>
      originalExercise.primary_muscle_groups.includes(m)
    );
    if (hasSharedPrimary) {
      compatibilityScore += 25;
      reasons.push('SHARED_PRIMARY_MUSCLE_GROUP');
    }

    // 4. Tipo composto vs isolador idêntico
    if (candidate.is_compound === originalExercise.is_compound) {
      compatibilityScore += 15;
      reasons.push('MATCHING_KINETIC_CHAIN');
    }

    // 5. Nível de complexidade idêntico
    if (candidate.complexity_level === originalExercise.complexity_level) {
      compatibilityScore += 10;
      reasons.push('MATCHING_COMPLEXITY');
    }

    // Só incluir se tiver alguma compatibilidade biomecânica relevante (>= 50)
    if (compatibilityScore >= 50) {
      options.push({
        exercise_id: candidate.id,
        exercise_name: candidate.name,
        movement_pattern: candidate.movement_pattern,
        primary_muscle_groups: candidate.primary_muscle_groups,
        required_equipment: candidate.required_equipment,
        complexity_level: candidate.complexity_level,
        compatibility_score: compatibilityScore,
        reason_codes: reasons,
        volume_delta_sets: 0,
      });
    }
  }

  // Ordenação determinística estrita: compatibility_score DESC, depois exercise_id ASC
  options.sort((a, b) => {
    if (b.compatibility_score !== a.compatibility_score) {
      return b.compatibility_score - a.compatibility_score;
    }
    return a.exercise_id.localeCompare(b.exercise_id);
  });

  return options;
}
