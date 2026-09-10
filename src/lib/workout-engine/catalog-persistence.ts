import { createHash } from 'node:crypto';
import type { Exercise } from '@/types/workout-engine';

/**
 * Converte o código estável do catálogo curado em UUID determinístico.
 * O banco usa UUID como FK, enquanto o motor usa códigos legíveis e estáveis.
 */
export function exerciseCodeToUuid(code: string): string {
  const hex = createHash('sha256').update(`appnutri:exercise:${code}`).digest('hex').slice(0, 32).split('');
  hex[12] = '5';
  hex[16] = ((Number.parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  const value = hex.join('');
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

export function toPersistedExercise(exercise: Exercise) {
  return {
    id: exerciseCodeToUuid(exercise.code),
    code: exercise.code,
    name: exercise.name,
    normalized_name: exercise.normalized_name,
    aliases: exercise.aliases,
    movement_pattern: exercise.movement_pattern,
    primary_muscle_groups: exercise.primary_muscle_groups,
    secondary_muscle_groups: exercise.secondary_muscle_groups,
    required_equipment: exercise.required_equipment,
    complexity_level: exercise.complexity_level,
    is_unilateral: exercise.is_unilateral,
    is_compound: exercise.is_compound,
    safety_contraindications: exercise.safety_contraindications,
    instructions: exercise.instructions,
    source_version: exercise.source_version,
    is_active: exercise.is_active,
  };
}
