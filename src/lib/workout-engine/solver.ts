/**
 * Solver Multiobjetivo Determinístico e Ordenação Heurística Versionada (ETAPA 7)
 * Versionado e estrito (WORKOUT_ENGINE_VERSION = '1.0.0').
 * ZERO Math.random(). Desempates lexicográficos estáveis por ID.
 * Preserva snapshot histórico imutável por exercício.
 */

import {
  Exercise,
  WorkoutConstraints,
  WorkoutExperienceLevel,
  WorkoutObjective,
  WorkoutExercisePrescription,
} from '@/types/workout-engine';
import { SessionSlotTemplate } from './split-templates';
import {
  SOLVER_SCORING_WEIGHTS,
  OBJECTIVE_REP_HEURISTICS,
} from './config';
import { computeExerciseSnapshotHash } from './catalog';

export interface ScoredExerciseCandidate {
  exercise: Exercise;
  score: number;
  breakdown: Record<string, number>;
}

/**
 * Calcula a pontuação multiobjetivo de um candidato a um slot específico.
 */
export function scoreExerciseForSlot(
  exercise: Exercise,
  slot: SessionSlotTemplate,
  constraints: WorkoutConstraints,
  experienceLevel: WorkoutExperienceLevel,
  sessionSelectedIds: Set<string>
): ScoredExerciseCandidate {
  let score = 0.0;
  const breakdown: Record<string, number> = {};

  // 1. Compatibilidade com o padrão de movimento do slot
  if (exercise.movement_pattern === slot.pattern) {
    score += 50.0;
    breakdown.patternMatch = 50.0;
  } else {
    // Penalidade severa se não for o padrão pretendido
    score -= 100.0;
    breakdown.patternMismatch = -100.0;
  }

  // 2. Cobertura do músculo alvo primário
  if (exercise.primary_muscle_groups.includes(slot.target_muscle)) {
    score += 25.0;
    breakdown.targetMusclePrimary = 25.0;
  } else if (exercise.secondary_muscle_groups.includes(slot.target_muscle)) {
    score += 10.0;
    breakdown.targetMuscleSecondary = 10.0;
  }

  // 3. Preferência do slot por composto
  if (slot.prefer_compound && exercise.is_compound) {
    score += SOLVER_SCORING_WEIGHTS.COMPOUND_PRIORITY_BONUS;
    breakdown.compoundBonus = SOLVER_SCORING_WEIGHTS.COMPOUND_PRIORITY_BONUS;
  } else if (!slot.prefer_compound && !exercise.is_compound) {
    score += 15.0;
    breakdown.isolationBonus = 15.0;
  }

  // 4. Soft Preference: Exercício Favorito
  const favSet = new Set(constraints.favorite_exercises.map((f) => f.toLowerCase().trim()));
  const isFav =
    favSet.has(exercise.id.toLowerCase()) ||
    favSet.has(exercise.code.toLowerCase()) ||
    favSet.has(exercise.normalized_name.toLowerCase());

  if (isFav) {
    score += SOLVER_SCORING_WEIGHTS.FAVORITE_BONUS;
    breakdown.favoriteBonus = SOLVER_SCORING_WEIGHTS.FAVORITE_BONUS;
  }

  // 5. Soft Preference: Equipamento Preferido
  if (constraints.preferred_equipment && constraints.preferred_equipment.length > 0) {
    const prefEquipSet = new Set(
      constraints.preferred_equipment.map((eq) => eq.toLowerCase())
    );
    const usesPreferred = exercise.required_equipment.some((eq) =>
      prefEquipSet.has(eq.toLowerCase())
    );
    if (usesPreferred) {
      score += SOLVER_SCORING_WEIGHTS.PREFERRED_EQUIPMENT_BONUS;
      breakdown.preferredEquipBonus = SOLVER_SCORING_WEIGHTS.PREFERRED_EQUIPMENT_BONUS;
    }
  }

  // 6. Alinhamento de Complexidade com Nível de Experiência
  if (exercise.complexity_level === experienceLevel) {
    score += SOLVER_SCORING_WEIGHTS.COMPLEXITY_MATCH_BONUS;
    breakdown.complexityMatchBonus = SOLVER_SCORING_WEIGHTS.COMPLEXITY_MATCH_BONUS;
  }

  // 7. Penalidade de Redundância/Fadiga Intra-sessão
  if (sessionSelectedIds.has(exercise.id)) {
    score -= 1000.0;
    breakdown.duplicatePenalty = -1000.0;
  }

  return { exercise, score, breakdown };
}

/**
 * Calcula deterministicamente o escore de ordenação de um exercício na sessão.
 * Baseado em heurísticas operacionais versionadas:
 * - Demanda de estabilização
 * - Complexidade motora
 * - Alinhamento ao objetivo
 * - Preferência do usuário
 * (NÃO é uma regra rígida 'free-weight compound always before machine', mas uma heurística contínua ponderada).
 */
export function calculateExerciseOrderScore(
  exercise: Exercise,
  objective: WorkoutObjective,
  constraints: WorkoutConstraints
): number {
  let score = 0.0;

  // 1. Demanda de Estabilização e Coordenação
  if (exercise.is_compound) {
    if (exercise.required_equipment.includes('barbell')) {
      score += 40.0;
    } else if (exercise.required_equipment.includes('dumbbell')) {
      score += 30.0;
    } else if (exercise.required_equipment.includes('bodyweight')) {
      score += 25.0;
    } else {
      score += 15.0; // máquinas e cabos
    }
  } else {
    // Isoladores e core no terço final
    score += exercise.movement_pattern === 'core' ? 5.0 : 10.0;
  }

  // 2. Complexidade do movimento
  if (exercise.complexity_level === 'advanced') {
    score += 20.0;
  } else if (exercise.complexity_level === 'intermediate') {
    score += 10.0;
  }

  // 3. Alinhamento com objetivo
  if (objective === 'strength_foundation' && exercise.is_compound) {
    score += 20.0; // Prioridade máxima em frescor para força máxima
  } else if (objective === 'hypertrophy') {
    score += 10.0;
  }

  // 4. Preferência do usuário
  const favSet = new Set(constraints.favorite_exercises.map((f) => f.toLowerCase().trim()));
  if (favSet.has(exercise.id.toLowerCase()) || favSet.has(exercise.code.toLowerCase())) {
    score += 5.0;
  }

  return score;
}

/**
 * Resolve e aloca deterministicamente os exercícios para uma sessão completa.
 * Preserva snapshot histórico completo de cada exercício.
 */
export function solveSessionExercises(
  slots: SessionSlotTemplate[],
  eligibleExercises: Exercise[],
  constraints: WorkoutConstraints,
  experienceLevel: WorkoutExperienceLevel,
  objective: WorkoutObjective,
  setsPerExercise: number
): WorkoutExercisePrescription[] {
  const sessionSelectedIds = new Set<string>();
  const chosenExercises: Exercise[] = [];
  const repHeuristic = OBJECTIVE_REP_HEURISTICS[objective];

  for (const slot of slots) {
    const candidates = eligibleExercises.filter(
      (e) => e.movement_pattern === slot.pattern && !sessionSelectedIds.has(e.id)
    );

    if (candidates.length === 0) {
      const fallbackCandidates = eligibleExercises.filter(
        (e) =>
          e.primary_muscle_groups.includes(slot.target_muscle) &&
          !sessionSelectedIds.has(e.id)
      );
      if (fallbackCandidates.length > 0) {
        candidates.push(...fallbackCandidates);
      }
    }

    if (candidates.length === 0) {
      continue;
    }

    const scoredList = candidates.map((candidate) =>
      scoreExerciseForSlot(
        candidate,
        slot,
        constraints,
        experienceLevel,
        sessionSelectedIds
      )
    );

    scoredList.sort((a, b) => {
      if (Math.abs(b.score - a.score) > 0.0001) {
        return b.score - a.score;
      }
      return a.exercise.id.localeCompare(b.exercise.id);
    });

    const best = scoredList[0].exercise;
    sessionSelectedIds.add(best.id);
    chosenExercises.push(best);
  }

  // Ordenação determinística baseada na função de escore de ordenação (heurística contínua)
  chosenExercises.sort((a, b) => {
    const scoreA = calculateExerciseOrderScore(a, objective, constraints);
    const scoreB = calculateExerciseOrderScore(b, objective, constraints);
    if (Math.abs(scoreB - scoreA) > 0.0001) {
      return scoreB - scoreA;
    }
    // Desempate lexicográfico estável
    return a.id.localeCompare(b.id);
  });

  // Montar prescrições com snapshot histórico imutável por exercício
  return chosenExercises.map((exercise, idx) => {
    const isCompound = exercise.is_compound;
    const minReps = isCompound
      ? repHeuristic.compound_min_reps
      : repHeuristic.isolation_min_reps;
    const maxReps = isCompound
      ? repHeuristic.compound_max_reps
      : repHeuristic.isolation_max_reps;
    const restSec = isCompound
      ? repHeuristic.compound_rest_seconds
      : repHeuristic.isolation_rest_seconds;

    return {
      exercise_id: exercise.id,
      exercise_order: idx + 1,
      exercise_name: exercise.name,
      movement_pattern: exercise.movement_pattern,
      prescribed_sets: setsPerExercise,
      min_reps: minReps,
      max_reps: maxReps,
      target_rir: repHeuristic.default_target_rir,
      target_rpe: repHeuristic.default_target_rpe,
      rest_seconds: restSec,
      warmup_sets: isCompound ? 2 : 1,
      progression_strategy: 'double_progression',
      notes: exercise.instructions,

      // Snapshot histórico do exercício no momento da composição
      exercise_snapshot_hash: computeExerciseSnapshotHash(exercise),
      primary_muscle_groups: exercise.primary_muscle_groups,
      secondary_muscle_groups: exercise.secondary_muscle_groups,
      required_equipment: exercise.required_equipment,
      complexity_level: exercise.complexity_level,
      is_unilateral: exercise.is_unilateral,
      is_compound: exercise.is_compound,
      catalog_source_version: exercise.source_version,
    };
  });
}
