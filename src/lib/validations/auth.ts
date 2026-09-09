import { z } from 'zod';

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, 'O email é obrigatório')
    .email('Formato de email inválido'),
  password: z
    .string()
    .min(6, 'A senha deve conter no mínimo 6 caracteres'),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const registerSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, 'O nome completo deve conter pelo menos 2 caracteres')
    .max(120, 'O nome não pode ultrapassar 120 caracteres'),
  email: z
    .string()
    .trim()
    .min(1, 'O email é obrigatório')
    .email('Formato de email inválido'),
  password: z
    .string()
    .min(8, 'A senha deve conter no mínimo 8 caracteres')
    .regex(/[A-Z]/, 'A senha deve conter ao menos uma letra maiúscula')
    .regex(/[0-9]/, 'A senha deve conter ao menos um número'),
});

export type RegisterInput = z.infer<typeof registerSchema>;

export const patientLinkSchema = z.object({
  professionalId: z.string().uuid('ID do profissional inválido'),
  patientId: z.string().uuid('ID do paciente inválido'),
  organizationId: z.string().uuid('ID da organização inválido').optional().nullable(),
  isPrimary: z.boolean().default(true),
  status: z.enum(['active', 'inactive', 'transferred', 'pending']).default('active'),
  linkType: z.enum(['direct', 'organization', 'influencer_referral']).default('direct'),
  notes: z.string().max(500).optional(),
});

export type PatientLinkInput = z.infer<typeof patientLinkSchema>;
