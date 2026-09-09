/**
 * Tipagens do Motor Determinístico de Treino (ETAPA 7)
 * Arquitetura Versionada, Imutável e Auditável do AppNutri
 * Versionamento formal de catálogo, proveniência e snapshots históricos.
 */

export type WorkoutObjective =
  | 'hypertrophy'
  | 'general_fitness'
  | 'strength_foundation'
  | 'weight_loss_support'
  | 'conditioning_foundation';

export type WorkoutExperienceLevel = 'beginner' | 'intermediate' | 'advanced';

export type MovementPattern =
  | 'squat'
  | 'hinge'
  | 'push_horizontal'
  | 'push_vertical'
  | 'pull_horizontal'
  | 'pull_vertical'
  | 'lunge'
  | 'carry'
  | 'core'
  | 'isolation';

export type MuscleGroup =
  | 'chest'
  | 'back'
  | 'quadriceps'
  | 'hamstrings'
  | 'glutes'
  | 'calves'
  | 'shoulders'
  | 'biceps'
  | 'triceps'
  | 'forearms'
  | 'core';

export type EquipmentType =
  | 'barbell'
  | 'dumbbell'
  | 'cable'
  | 'machine'
  | 'bodyweight'
  | 'bench'
  | 'pull_up_bar'
  | 'resistance_band';

export type SplitType = 'full_body' | 'upper_lower' | 'push_pull_legs' | 'custom_split';

export type WorkoutGenerationStatus =
  | 'calculated'
  | 'review_required'
  | 'infeasible'
  | 'superseded';

export type WorkoutApprovalStatus = 'draft' | 'approved' | 'rejected' | 'superseded';

export type ExerciseProgressionStrategy =
  | 'double_progression'
  | 'linear_load'
  | 'density_reps'
  | 'maintenance';

export type WorkoutInfeasibleReasonCode =
  | 'NO_COMPATIBLE_EXERCISES'
  | 'INSUFFICIENT_EQUIPMENT'
  | 'FREQUENCY_UNSUPPORTED'
  | 'CONSTRAINT_CONFLICT'
  | 'INSUFFICIENT_PROFILE_DATA'
  | 'REVIEW_REQUIRED';

export type ProgressionUnit = 'kg' | 'lb';

export interface Exercise {
  id: string;
  code: string;
  name: string;
  normalized_name: string;
  aliases: string[];
  movement_pattern: MovementPattern;
  primary_muscle_groups: MuscleGroup[];
  secondary_muscle_groups: MuscleGroup[];
  required_equipment: EquipmentType[];
  complexity_level: WorkoutExperienceLevel;
  is_unilateral: boolean;
  is_compound: boolean;
  safety_contraindications: string[]; // Restrições de movimento estruturadas (ex: 'avoid_overhead_press')
  instructions: string;
  source_version: string;
  provenance: string;
  is_active: boolean;
}

export interface EquipmentIncrementConfig {
  value: number;
  unit: ProgressionUnit;
}

export interface WorkoutConstraints {
  available_equipment: EquipmentType[];
  preferred_equipment?: EquipmentType[];
  favorite_exercises: string[];
  exercises_refused: string[];
  /** Restrições de movimento biomecânicas explicitamente fornecidas */
  movement_contraindications: string[];
  explicit_movement_restrictions?: string[];
  /** Flag indicando se há sintomas clínicos não avaliados por profissional habilitado (gera review_required) */
  has_unassessed_clinical_symptoms?: boolean;
  unassessed_symptoms_description?: string;
  /** Incrementos estruturados conhecidos por tipo de equipamento (opcional; se ausente, não inventa carga) */
  equipment_increments?: Record<string, EquipmentIncrementConfig>;
  preferred_split_type?: SplitType;
}

export interface WorkoutExercisePrescription {
  id?: string;
  workout_session_id?: string;
  exercise_id: string;
  exercise_order: number;
  exercise_name: string;
  movement_pattern: MovementPattern;
  prescribed_sets: number;
  min_reps: number;
  max_reps: number;
  target_rir: number | null;
  target_rpe: number | null;
  rest_seconds: number;
  tempo?: string | null;
  warmup_sets: number;
  notes?: string | null;
  progression_strategy: ExerciseProgressionStrategy;

  // Snapshot histórico imutável do exercício no momento da geração
  exercise_snapshot_hash: string;
  primary_muscle_groups: MuscleGroup[];
  secondary_muscle_groups: MuscleGroup[];
  required_equipment: EquipmentType[];
  complexity_level: WorkoutExperienceLevel;
  is_unilateral: boolean;
  is_compound: boolean;
  catalog_source_version: string;
}

export interface WorkoutSession {
  id?: string;
  workout_program_day_id?: string;
  session_order: number;
  name: string;
  session_focus: string;
  estimated_duration_minutes: number;
  warmup_protocol: Array<{ step: string; duration_seconds?: number }>;
  cooldown_protocol: Array<{ step: string; duration_seconds?: number }>;
  exercises: WorkoutExercisePrescription[];
}

export interface WorkoutProgramDay {
  id?: string;
  workout_program_id?: string;
  day_of_week: number;
  day_label: string;
  is_rest_day: boolean;
  sessions: WorkoutSession[];
}

export interface WorkoutProgram {
  id: string;
  patient_id: string;
  engine_version: string;
  config_version: string;
  catalog_version: string;
  catalog_checksum: string;
  catalog_provenance: string;
  source_profile_version: number;
  input_snapshot_hash: string;
  output_program_hash: string;
  objective: WorkoutObjective;
  experience_level: WorkoutExperienceLevel;
  sessions_per_week: number;
  session_duration_minutes: number;
  split_type: SplitType;
  generation_status: WorkoutGenerationStatus;
  approval_status: WorkoutApprovalStatus;
  rejection_reason: string | null;
  infeasible_reason_codes: WorkoutInfeasibleReasonCode[];
  version: number;
  superseded_by?: string | null;
  is_active: boolean;
  generation_reference_at: string;
  days: WorkoutProgramDay[];
  created_by?: string | null;
  approved_by?: string | null;
  approved_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface ExerciseSubstitutionOption {
  exercise_id: string;
  exercise_name: string;
  movement_pattern: MovementPattern;
  primary_muscle_groups: MuscleGroup[];
  required_equipment: EquipmentType[];
  complexity_level: WorkoutExperienceLevel;
  compatibility_score: number;
  reason_codes: string[];
  volume_delta_sets: number;
}

export interface WorkoutComposerInput {
  patient_id: string;
  objective: WorkoutObjective;
  experience_level: WorkoutExperienceLevel;
  sessions_per_week: number;
  session_duration_minutes?: number;
  constraints: WorkoutConstraints;
  catalog: Exercise[];
  catalog_version?: string;
  catalog_checksum?: string;
  catalog_provenance?: string;
  source_profile_version?: number;
  generation_reference_at?: string;
}

export interface WorkoutComposerResult {
  success: boolean;
  generation_status: WorkoutGenerationStatus;
  infeasible_reason_codes: WorkoutInfeasibleReasonCode[];
  error_message?: string;
  program?: WorkoutProgram;
}
