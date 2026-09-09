/**
 * Configurações Operacionais Versionadas do Motor de Treino (ETAPA 7)
 * Heurísticas Operacionais Versionadas - NÃO são dogmas clínicos ou prescrições médicas.
 */

import {
  WorkoutObjective,
  WorkoutExperienceLevel,
  MuscleGroup,
} from '@/types/workout-engine';

export const WORKOUT_ENGINE_VERSION = '1.0.0';
export const WORKOUT_CONFIG_VERSION = 'config-1.0.0';

/**
 * Coeficiente de contribuição indireta para grupos musculares secundários.
 * 1 série de exercício composto conta 1.0 para o músculo primário e 0.5 para secundários,
 * evitando matematicamente a contagem dupla (double counting) de volume.
 */
export const SECONDARY_MUSCLE_VOLUME_COEFFICIENT = 0.5;

/**
 * Faixas operacionais sugeridas de séries (sets) por grupo muscular primário por semana.
 * Documentadas estritamente como heurísticas operacionais de software, candidatas à revisão profissional.
 */
export const OPERATIONAL_VOLUME_HEURISTICS: Record<
  WorkoutExperienceLevel,
  {
    min_sets_per_muscle_week: number;
    max_sets_per_muscle_week: number;
    description: string;
  }
> = {
  beginner: {
    min_sets_per_muscle_week: 8,
    max_sets_per_muscle_week: 10,
    description: 'Faixa operacional heurística inicial (8–10 sets/músculo/semana). Não é limite universal nem prescrição clínica.',
  },
  intermediate: {
    min_sets_per_muscle_week: 12,
    max_sets_per_muscle_week: 16,
    description: 'Faixa operacional heurística intermediária (12–16 sets/músculo/semana). Não é limite universal nem prescrição clínica.',
  },
  advanced: {
    min_sets_per_muscle_week: 16,
    max_sets_per_muscle_week: 20,
    description: 'Faixa operacional heurística avançada (16–20 sets/músculo/semana). Não é limite universal nem prescrição clínica.',
  },
};

/**
 * Faixas de repetições prescritas por objetivo e tipo de exercício (composto vs isolador).
 */
export const OBJECTIVE_REP_HEURISTICS: Record<
  WorkoutObjective,
  {
    compound_min_reps: number;
    compound_max_reps: number;
    isolation_min_reps: number;
    isolation_max_reps: number;
    compound_rest_seconds: number;
    isolation_rest_seconds: number;
    default_target_rir: number;
    default_target_rpe: number;
  }
> = {
  hypertrophy: {
    compound_min_reps: 8,
    compound_max_reps: 12,
    isolation_min_reps: 10,
    isolation_max_reps: 15,
    compound_rest_seconds: 90,
    isolation_rest_seconds: 60,
    default_target_rir: 2,
    default_target_rpe: 8.0,
  },
  strength_foundation: {
    compound_min_reps: 5,
    compound_max_reps: 8,
    isolation_min_reps: 8,
    isolation_max_reps: 12,
    compound_rest_seconds: 150,
    isolation_rest_seconds: 90,
    default_target_rir: 2,
    default_target_rpe: 8.0,
  },
  general_fitness: {
    compound_min_reps: 10,
    compound_max_reps: 15,
    isolation_min_reps: 12,
    isolation_max_reps: 15,
    compound_rest_seconds: 75,
    isolation_rest_seconds: 60,
    default_target_rir: 3,
    default_target_rpe: 7.0,
  },
  weight_loss_support: {
    compound_min_reps: 8,
    compound_max_reps: 12,
    isolation_min_reps: 12,
    isolation_max_reps: 15,
    compound_rest_seconds: 60,
    isolation_rest_seconds: 45,
    default_target_rir: 2,
    default_target_rpe: 8.0,
  },
  conditioning_foundation: {
    compound_min_reps: 12,
    compound_max_reps: 20,
    isolation_min_reps: 15,
    isolation_max_reps: 20,
    compound_rest_seconds: 45,
    isolation_rest_seconds: 30,
    default_target_rir: 2,
    default_target_rpe: 8.0,
  },
};

/**
 * Pesos da função de pontuação multiobjetivo determinística do Solver
 */
export const SOLVER_SCORING_WEIGHTS = {
  FAVORITE_BONUS: 30.0,
  DISLIKED_PENALTY: 40.0,
  PREFERRED_EQUIPMENT_BONUS: 15.0,
  COMPOUND_PRIORITY_BONUS: 20.0,
  COMPLEXITY_MATCH_BONUS: 10.0,
  CONSECUTIVE_MUSCLE_FATIGUE_PENALTY: 15.0,
};

/**
 * Pesos para o scoring determinístico de ordenação de exercícios na sessão.
 * A ordem NÃO é uma regra rígida (hard rule) de "livre sempre antes de máquina",
 * mas uma função de pontuação contínua baseada em complexidade motora, demanda de estabilização,
 * alinhamento ao objetivo e frescor muscular.
 */
export const EXERCISE_ORDER_WEIGHTS = {
  STABILITY_DEMAND_WEIGHT: 25.0, // Exercícios que exigem alta estabilização tridimensional
  COMPLEXITY_WEIGHT: 20.0,      // Complexidade técnica da execução
  COMPOUND_WEIGHT: 15.0,        // Demanda multiarticular
  OBJECTIVE_PRIORITY_WEIGHT: 10.0, // Relevância direta ao objetivo
};

export const MAJOR_MUSCLE_GROUPS: MuscleGroup[] = [
  'chest',
  'back',
  'quadriceps',
  'hamstrings',
  'glutes',
  'shoulders',
];
