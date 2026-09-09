/**
 * Filtro Eliminatório de Candidatos a Exercício (ETAPA 7)
 * Aplicação estrita de Hard Constraints e princípio UNKNOWN != SAFE.
 * NÃO infere diagnósticos ou contraindicações médicas a partir de sintomas clínicos.
 * Versionado e determinístico (WORKOUT_ENGINE_VERSION = '1.0.0').
 */

import { Exercise, WorkoutConstraints, WorkoutExperienceLevel } from '@/types/workout-engine';

export interface FilterResult {
  eligible: Exercise[];
  rejectedMap: Map<string, string[]>;
  requiresClinicalReview: boolean;
}

/**
 * Filtra o catálogo eliminando rigorosamente candidatos incompatíveis com hard constraints estruturadas.
 * SYMPTOM != AUTOMATIC DIAGNOSIS: Sintomas clínicos não geram bloqueios ad-hoc, mas sim flags de revisão prévia.
 */
export function filterCandidateExercises(
  catalog: Exercise[],
  constraints: WorkoutConstraints,
  experienceLevel: WorkoutExperienceLevel
): FilterResult {
  const eligible: Exercise[] = [];
  const rejectedMap = new Map<string, string[]>();

  const availableEquipSet = new Set(constraints.available_equipment.map((e) => e.toLowerCase()));
  const refusedSet = new Set(
    constraints.exercises_refused.map((r) => r.toLowerCase().trim())
  );
  const allRestrictions = [
    ...(constraints.movement_contraindications ?? []),
    ...(constraints.explicit_movement_restrictions ?? []),
  ];
  const explicitContraindicationsSet = new Set(
    allRestrictions.map((c) => c.toLowerCase().trim())
  );

  // Se houver sintomas clínicos não avaliados por profissional de saúde, marca flag estruturada
  const requiresClinicalReview = Boolean(constraints.has_unassessed_clinical_symptoms);

  for (const exercise of catalog) {
    const reasons: string[] = [];

    // 1. Ativação
    if (!exercise.is_active) {
      reasons.push('EXERCISE_INACTIVE');
    }

    // 2. Hard Constraint: Exercício expressamente recusado pelo paciente
    const isRefused =
      refusedSet.has(exercise.id.toLowerCase()) ||
      refusedSet.has(exercise.code.toLowerCase()) ||
      refusedSet.has(exercise.normalized_name.toLowerCase());

    if (isRefused) {
      reasons.push('EXERCISE_REFUSED_BY_PATIENT');
    }

    // 3. Hard Constraint: Equipamentos disponíveis
    // UNKNOWN != SAFE: equipamento não especificado não é assumido como seguro
    if (!exercise.required_equipment || exercise.required_equipment.length === 0) {
      reasons.push('EQUIPMENT_UNSPECIFIED');
    } else {
      const hasAllEquipment = exercise.required_equipment.every((eq) =>
        availableEquipSet.has(eq.toLowerCase())
      );
      if (!hasAllEquipment) {
        reasons.push('INSUFFICIENT_EQUIPMENT');
      }
    }

    // 4. Hard Constraint: Restrições biomecânicas de movimento explicitamente fornecidas
    // (Não inventa diagnósticos de sintomas; apenas obedece flags estruturadas fornecidas)
    if (exercise.safety_contraindications && exercise.safety_contraindications.length > 0) {
      const hasDirectContraindication = exercise.safety_contraindications.some((contra) =>
        explicitContraindicationsSet.has(contra.toLowerCase())
      );
      if (hasDirectContraindication) {
        reasons.push('EXPLICIT_MOVEMENT_RESTRICTION_COLLISION');
      }
    }

    // 5. Nível de complexidade x Experiência
    // Iniciantes não recebem exercícios classificados como 'advanced'
    if (experienceLevel === 'beginner' && exercise.complexity_level === 'advanced') {
      reasons.push('COMPLEXITY_EXCEEDS_EXPERIENCE');
    }

    if (reasons.length === 0) {
      eligible.push(exercise);
    } else {
      rejectedMap.set(exercise.id, reasons);
    }
  }

  // Ordenação determinística estável do catálogo elegível
  eligible.sort((a, b) => a.id.localeCompare(b.id));

  return { eligible, rejectedMap, requiresClinicalReview };
}
