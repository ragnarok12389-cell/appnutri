import { z } from 'zod';

export const PROGRESS_ENGINE_VERSION = '1.0.0';
export const PROGRESS_CONFIG_VERSION = 'progress-config-1.0.0';

export const CheckInInputSchema = z
  .object({
    check_in_date: z.iso.date(),
    weight_kg: z.number().min(20).max(400).optional(),
    hunger_level: z.number().int().min(1).max(5).optional(),
    energy_level: z.number().int().min(1).max(5).optional(),
    sleep_quality: z.number().int().min(1).max(5).optional(),
    nutrition_adherence_rating: z.number().int().min(1).max(5).optional(),
    workout_adherence_rating: z.number().int().min(1).max(5).optional(),
    concerning_symptoms: z.boolean().default(false),
    notes: z.string().trim().max(1000).optional(),
  })
  .refine(
    (value) =>
      value.weight_kg !== undefined ||
      value.hunger_level !== undefined ||
      value.energy_level !== undefined ||
      value.sleep_quality !== undefined ||
      value.nutrition_adherence_rating !== undefined ||
      value.workout_adherence_rating !== undefined ||
      value.concerning_symptoms ||
      Boolean(value.notes),
    { message: 'Informe pelo menos um dado para registrar o check-in.' }
  );

export type CheckInInput = z.infer<typeof CheckInInputSchema>;

export interface ProgressCheckIn extends CheckInInput {
  id: string;
  patient_id: string;
  created_at: string;
}

export interface ProgressFeedbackInput {
  id: string;
  feedback_type: string;
  domain: 'nutrition' | 'workout' | 'general';
  intensity_rating?: number;
  created_at: string;
}

export interface ProgressAnalysisInput {
  patient_id: string;
  window_start: string;
  window_end: string;
  check_ins: ProgressCheckIn[];
  workout_session_dates: string[];
  feedback_events: ProgressFeedbackInput[];
}

export type ProgressReasonCode =
  | 'INSUFFICIENT_CHECK_IN_DATA'
  | 'WEIGHT_TREND_AVAILABLE'
  | 'RECURRING_HIGH_HUNGER'
  | 'LOW_NUTRITION_ADHERENCE'
  | 'LOW_WORKOUT_ADHERENCE'
  | 'RECURRING_EXERCISE_DISCOMFORT'
  | 'RECURRING_INCOMPLETE_WORKOUTS'
  | 'RECURRING_SCHEDULE_ISSUES'
  | 'CONCERNING_SYMPTOM_REPORTED';

export type AdjustmentProposalType =
  | 'review_meal_satiety'
  | 'review_nutrition_adherence'
  | 'review_workout_adherence'
  | 'review_exercise_discomfort'
  | 'review_routine_feasibility'
  | 'professional_follow_up';

export interface AdjustmentProposalDraft {
  domain: 'nutrition' | 'workout' | 'general';
  proposal_type: AdjustmentProposalType;
  priority: 'low' | 'medium' | 'high';
  reason_codes: ProgressReasonCode[];
  summary: string;
}

export interface ProgressAnalysisResult {
  engine_version: typeof PROGRESS_ENGINE_VERSION;
  config_version: typeof PROGRESS_CONFIG_VERSION;
  input_hash: string;
  output_hash: string;
  data_quality: 'insufficient' | 'partial' | 'sufficient';
  metrics: {
    check_in_count: number;
    workouts_completed: number;
    weight_samples: number;
    weight_change_kg: number | null;
    average_hunger: number | null;
    average_energy: number | null;
    average_sleep_quality: number | null;
    average_nutrition_adherence: number | null;
    average_workout_adherence: number | null;
  };
  reason_codes: ProgressReasonCode[];
  proposals: AdjustmentProposalDraft[];
}

export const ReviewAdjustmentProposalSchema = z.object({
  proposal_id: z.string().uuid(),
  decision: z.enum(['accepted_for_review', 'dismissed']),
  notes: z.string().trim().max(1000).optional(),
});

