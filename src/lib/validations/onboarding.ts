import { z } from 'zod';

export const PATIENT_GOALS = [
  'lose_weight',
  'gain_muscle',
  'maintain_weight',
  'improve_health',
  'improve_performance',
] as const;

export const patientOnboardingSchema = z.object({
  first_name: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres').trim(),
  last_name: z.string().min(2, 'Sobrenome deve ter pelo menos 2 caracteres').trim(),
  birth_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data de nascimento deve estar no formato YYYY-MM-DD').optional().nullable(),
  gender: z.enum(['male', 'female', 'other', 'prefer_not_to_say']).optional().nullable(),
  height_cm: z.number().min(50, 'Altura mínima de 50 cm').max(250, 'Altura máxima de 250 cm').optional().nullable(),
  weight_kg: z.number().min(20, 'Peso mínimo de 20 kg').max(400, 'Peso máximo de 400 kg').optional().nullable(),
  country: z.string().min(2).max(3).default('BR'),
  city: z.string().trim().optional().nullable(),
  timezone: z.string().default('America/Sao_Paulo'),
  primary_goal: z.enum(PATIENT_GOALS, {
    message: 'Selecione um objetivo principal válido',
  }),
});

export type PatientOnboardingInput = z.infer<typeof patientOnboardingSchema>;

export const nutritionistOnboardingSchema = z.object({
  license_number: z.string().min(3, 'CRN é obrigatório para nutricionistas').trim(),
  license_state: z.string().length(2, 'UF do conselho regional deve ter 2 letras').toUpperCase().trim(),
  bio: z.string().max(1000, 'Biografia deve ter no máximo 1000 caracteres').optional().nullable(),
  specialties: z.array(z.string().trim()).min(1, 'Informe pelo menos uma especialidade').default([]),
});

export type NutritionistOnboardingInput = z.infer<typeof nutritionistOnboardingSchema>;

export const influencerOnboardingSchema = z.object({
  niche: z.string().min(2, 'Área de atuação / nicho é obrigatório').trim(),
  bio: z.string().max(1000, 'Biografia deve ter no máximo 1000 caracteres').optional().nullable(),
  social_links: z.record(z.string(), z.string()).default({}),
});

export type InfluencerOnboardingInput = z.infer<typeof influencerOnboardingSchema>;
