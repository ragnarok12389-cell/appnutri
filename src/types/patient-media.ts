import { z } from 'zod';

export const ProgressPhotoCheckpointSchema = z.enum(['start', 'midpoint', 'goal']);
export type ProgressPhotoCheckpoint = z.infer<typeof ProgressPhotoCheckpointSchema>;

export const MealPhotoAnalysisSchema = z.object({
  summary: z.string().min(1).max(500),
  identified_items: z.array(z.object({
    name: z.string().min(1).max(120),
    confidence: z.number().min(0).max(1),
  })).max(20),
  estimated_calories: z.object({ min: z.number().nonnegative(), max: z.number().nonnegative() }).nullable(),
  estimated_macros_g: z.object({
    protein: z.number().nonnegative(),
    carbohydrate: z.number().nonnegative(),
    fat: z.number().nonnegative(),
  }).nullable(),
  plan_alignment: z.enum(['aligned', 'partially_aligned', 'unclear', 'no_active_plan']),
  observations: z.array(z.string().min(1).max(300)).max(8),
  safety_flags: z.array(z.string().min(1).max(100)).max(8),
  confidence: z.enum(['low', 'medium', 'high']),
  disclaimer: z.string().min(1).max(500),
});

export type MealPhotoAnalysis = z.infer<typeof MealPhotoAnalysisSchema>;

export interface PatientProgressPhoto {
  id: string;
  checkpoint: ProgressPhotoCheckpoint;
  captured_at: string;
  notes: string | null;
  signed_url: string;
}

export interface PatientMealPhoto {
  id: string;
  captured_at: string;
  status: 'pending' | 'completed' | 'failed';
  analysis: MealPhotoAnalysis | null;
  error_code: string | null;
  signed_url: string;
}
