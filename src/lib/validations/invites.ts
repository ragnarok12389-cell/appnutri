import { z } from 'zod';

export const createProfessionalInviteSchema = z.object({
  email: z.string().email('Email inválido').toLowerCase().trim(),
  role_id: z.enum(['nutritionist', 'influencer'], {
    message: 'Papel do profissional deve ser Nutricionista ou Influenciador',
  }),
  organization_id: z.string().uuid('ID de organização inválido').optional().nullable(),
  expires_in_days: z.number().int().min(1).max(30).default(7),
});

export type CreateProfessionalInviteInput = z.infer<typeof createProfessionalInviteSchema>;

export const createPatientInviteSchema = z.object({
  email: z.string().email('Email inválido').toLowerCase().trim().optional().or(z.literal('')),
  expires_in_days: z.number().int().min(1).max(30).default(7),
});

export type CreatePatientInviteInput = z.infer<typeof createPatientInviteSchema>;

export const revokeInviteSchema = z.object({
  invite_id: z.string().uuid('ID de convite inválido'),
});

export type RevokeInviteInput = z.infer<typeof revokeInviteSchema>;

export const acceptPatientInviteSchema = z.object({
  token: z.string().min(32, 'Token de convite inválido').trim(),
  full_name: z.string().min(2, 'Nome completo deve ter pelo menos 2 caracteres').trim(),
  email: z.string().email('Email inválido').toLowerCase().trim(),
  password: z.string().min(8, 'Senha deve ter no mínimo 8 caracteres'),
});

export type AcceptPatientInviteInput = z.infer<typeof acceptPatientInviteSchema>;
