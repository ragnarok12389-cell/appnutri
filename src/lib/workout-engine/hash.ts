/**
 * Hashing Determinístico SHA-256 para o Motor de Treino (ETAPA 7)
 * Serialização canônica de chaves JSON e expurgo de campos voláteis.
 * Inclui versões de catálogo, checksums e snapshots de exercícios.
 * Versionado e auditável (WORKOUT_ENGINE_VERSION = '1.0.0').
 */

import crypto from 'crypto';
import { WorkoutComposerInput, WorkoutProgram } from '@/types/workout-engine';
import {
  WORKOUT_ENGINE_VERSION,
  WORKOUT_CONFIG_VERSION,
} from './config';
import {
  EXERCISE_CATALOG_VERSION,
  EXERCISE_CATALOG_CHECKSUM,
  EXERCISE_CATALOG_PROVENANCE,
} from './catalog';

/**
 * Serializador canônico que ordena recursivamente todas as chaves do objeto JSON.
 */
export function canonicalJsonStringify(obj: unknown): string {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }

  if (Array.isArray(obj)) {
    return '[' + obj.map((item) => canonicalJsonStringify(item)).join(',') + ']';
  }

  const keys = Object.keys(obj as Record<string, unknown>).sort();
  const pairs = keys.map((key) => {
    const value = (obj as Record<string, unknown>)[key];
    return JSON.stringify(key) + ':' + canonicalJsonStringify(value);
  });

  return '{' + pairs.join(',') + '}';
}

/**
 * Calcula o hash SHA-256 estável do snapshot de entrada.
 */
export function computeWorkoutInputHash(input: WorkoutComposerInput): string {
  const normalizedInput = {
    patient_id: input.patient_id,
    objective: input.objective,
    experience_level: input.experience_level,
    sessions_per_week: input.sessions_per_week,
    session_duration_minutes: input.session_duration_minutes ?? 60,
    constraints: {
      available_equipment: [...input.constraints.available_equipment].sort(),
      preferred_equipment: [...(input.constraints.preferred_equipment ?? [])].sort(),
      favorite_exercises: [...input.constraints.favorite_exercises].sort(),
      exercises_refused: [...input.constraints.exercises_refused].sort(),
      movement_contraindications: [...input.constraints.movement_contraindications].sort(),
      has_unassessed_clinical_symptoms: Boolean(input.constraints.has_unassessed_clinical_symptoms),
      preferred_split_type: input.constraints.preferred_split_type ?? null,
    },
    engine_version: WORKOUT_ENGINE_VERSION,
    config_version: WORKOUT_CONFIG_VERSION,
    catalog_version: input.catalog_version ?? EXERCISE_CATALOG_VERSION,
    catalog_checksum: input.catalog_checksum ?? EXERCISE_CATALOG_CHECKSUM,
    catalog_provenance: input.catalog_provenance ?? EXERCISE_CATALOG_PROVENANCE,
  };

  const canonicalString = canonicalJsonStringify(normalizedInput);
  return crypto.createHash('sha256').update(canonicalString).digest('hex');
}

/**
 * Calcula o hash SHA-256 estável do programa gerado.
 * Exclui UUIDs voláteis e timestamps operacionais que variariam a cada invocação.
 * Congela os snapshots históricos de todos os exercícios.
 */
export function computeWorkoutOutputHash(program: WorkoutProgram): string {
  const sanitizedDays = program.days.map((d) => ({
    day_of_week: d.day_of_week,
    day_label: d.day_label,
    is_rest_day: d.is_rest_day,
    sessions: d.sessions.map((s) => ({
      name: s.name,
      session_focus: s.session_focus,
      session_order: s.session_order,
      estimated_duration_minutes: s.estimated_duration_minutes,
      exercises: s.exercises.map((e) => ({
        exercise_id: e.exercise_id,
        exercise_name: e.exercise_name,
        exercise_order: e.exercise_order,
        movement_pattern: e.movement_pattern,
        prescribed_sets: e.prescribed_sets,
        min_reps: e.min_reps,
        max_reps: e.max_reps,
        target_rir: e.target_rir,
        target_rpe: e.target_rpe,
        rest_seconds: e.rest_seconds,
        warmup_sets: e.warmup_sets,
        progression_strategy: e.progression_strategy,
        exercise_snapshot_hash: e.exercise_snapshot_hash,
        primary_muscle_groups: [...e.primary_muscle_groups].sort(),
        secondary_muscle_groups: [...e.secondary_muscle_groups].sort(),
        required_equipment: [...e.required_equipment].sort(),
        complexity_level: e.complexity_level,
        is_unilateral: e.is_unilateral,
        is_compound: e.is_compound,
        catalog_source_version: e.catalog_source_version,
      })),
    })),
  }));

  const sanitizedProgram = {
    patient_id: program.patient_id,
    engine_version: program.engine_version,
    config_version: program.config_version,
    catalog_version: program.catalog_version,
    catalog_checksum: program.catalog_checksum,
    catalog_provenance: program.catalog_provenance,
    objective: program.objective,
    experience_level: program.experience_level,
    sessions_per_week: program.sessions_per_week,
    session_duration_minutes: program.session_duration_minutes,
    split_type: program.split_type,
    generation_status: program.generation_status,
    approval_status: program.approval_status,
    days: sanitizedDays,
  };

  const canonicalString = canonicalJsonStringify(sanitizedProgram);
  return crypto.createHash('sha256').update(canonicalString).digest('hex');
}
