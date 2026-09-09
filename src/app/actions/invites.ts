'use server';

import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth/session';
import { isProfessional, isAdmin } from '@/lib/auth/roles';
import { generateInviteToken, hashInviteToken, calculateExpirationDate } from '@/lib/crypto/tokens';
import {
  createPatientInviteSchema,
  createProfessionalInviteSchema,
  acceptPatientInviteSchema,
  CreatePatientInviteInput,
  CreateProfessionalInviteInput,
} from '@/lib/validations/invites';
import { logAuditEvent } from '@/lib/audit/logger';

export interface ActionResponse<T = unknown> {
  success?: boolean;
  data?: T;
  error?: string;
}

/**
 * Criação de convite seguro de paciente por nutricionista ou influenciador autenticado.
 */
export async function createPatientInviteAction(
  input: CreatePatientInviteInput
): Promise<ActionResponse<{ inviteId: string; rawToken: string; inviteUrl: string; expiresAt: string }>> {
  const user = await getCurrentUser();
  if (!user || (!isProfessional(user) && !isAdmin(user))) {
    return { error: 'Acesso não autorizado. Apenas profissionais podem gerar convites para pacientes.' };
  }

  const parsed = createPatientInviteSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message || 'Parâmetros de convite inválidos.' };
  }

  const { rawToken, tokenHash } = generateInviteToken();
  const expiresAt = calculateExpirationDate(parsed.data.expires_in_days).toISOString();

  const supabase = await createClient();

  const { data: invite, error: insertError } = await supabase
    .from('patient_invites')
    .insert({
      professional_id: user.id,
      organization_id: user.currentOrganization?.id || null,
      email: parsed.data.email || null,
      token_hash: tokenHash,
      status: 'pending',
      expires_at: expiresAt,
    })
    .select('id')
    .single();

  if (insertError || !invite) {
    return { error: 'Não foi possível gerar o convite. Tente novamente mais tarde.' };
  }

  // Registra auditoria
  await logAuditEvent({
    actorId: user.id,
    action: 'patient_invite.created',
    entityType: 'patient_invites',
    entityId: invite.id,
    organizationId: user.currentOrganization?.id || null,
    metadata: {
      recipient_email: parsed.data.email || null,
      expires_at: expiresAt,
    },
  });

  return {
    success: true,
    data: {
      inviteId: invite.id,
      rawToken,
      inviteUrl: `/invite/${rawToken}`,
      expiresAt,
    },
  };
}

/**
 * Revogação de convite pendente por profissional ou admin.
 */
export async function revokePatientInviteAction(
  inviteId: string
): Promise<ActionResponse<void>> {
  const user = await getCurrentUser();
  if (!user || (!isProfessional(user) && !isAdmin(user))) {
    return { error: 'Acesso não autorizado.' };
  }

  const supabase = await createClient();

  // Garante que o profissional só pode revogar seus próprios convites (ou admin pode revogar qualquer um)
  let query = supabase
    .from('patient_invites')
    .update({
      status: 'revoked',
      revoked_at: new Date().toISOString(),
    })
    .eq('id', inviteId)
    .eq('status', 'pending');

  if (!isAdmin(user)) {
    query = query.eq('professional_id', user.id);
  }

  const { error } = await query;
  if (error) {
    return { error: 'Falha ao revogar o convite.' };
  }

  await logAuditEvent({
    actorId: user.id,
    action: 'patient_invite.revoked',
    entityType: 'patient_invites',
    entityId: inviteId,
  });

  return { success: true };
}

/**
 * Criação de convite para profissional (NUTRITIONIST ou INFLUENCER) exclusivamente por ADMIN.
 */
export async function createProfessionalInviteAction(
  input: CreateProfessionalInviteInput
): Promise<ActionResponse<{ inviteId: string; rawToken: string; inviteUrl: string; expiresAt: string }>> {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) {
    return { error: 'Acesso restrito a administradores do sistema.' };
  }

  const parsed = createProfessionalInviteSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message || 'Dados inválidos para convite de profissional.' };
  }

  const { rawToken, tokenHash } = generateInviteToken();
  const expiresAt = calculateExpirationDate(parsed.data.expires_in_days).toISOString();

  const supabase = await createClient();

  const { data: invite, error: insertError } = await supabase
    .from('professional_invites')
    .insert({
      email: parsed.data.email,
      role_id: parsed.data.role_id,
      organization_id: parsed.data.organization_id || null,
      token_hash: tokenHash,
      created_by: user.id,
      expires_at: expiresAt,
    })
    .select('id')
    .single();

  if (insertError || !invite) {
    return { error: 'Falha ao registrar convite do profissional.' };
  }

  await logAuditEvent({
    actorId: user.id,
    action: 'professional_invite.created',
    entityType: 'professional_invites',
    entityId: invite.id,
    metadata: {
      invited_role: parsed.data.role_id,
      invited_email: parsed.data.email,
    },
  });

  return {
    success: true,
    data: {
      inviteId: invite.id,
      rawToken,
      inviteUrl: `/professional-invite/${rawToken}`,
      expiresAt,
    },
  };
}

/**
 * Validação pública de token de convite de paciente.
 */
export async function validatePatientInviteTokenAction(
  rawToken: string
): Promise<ActionResponse<{
  valid: boolean;
  professionalName?: string;
  professionalType?: string;
  organizationName?: string;
  email?: string;
  reason?: string;
}>> {
  try {
    const tokenHash = hashInviteToken(rawToken);
    const supabase = await createClient();

    const { data, error } = await supabase.rpc('validate_patient_invite', {
      p_token_hash: tokenHash,
    });

    if (error || !data) {
      return { success: false, error: 'Erro ao validar convite.' };
    }

    return {
      success: true,
      data: {
        valid: Boolean(data.valid),
        professionalName: data.professional_name,
        professionalType: data.professional_type,
        organizationName: data.organization_name,
        email: data.email,
        reason: data.reason,
      },
    };
  } catch {
    return { success: false, error: 'Token inválido ou corrompido.' };
  }
}

/**
 * Aceitação do convite de paciente e criação atômica da conta e vínculo.
 */
export async function acceptPatientInviteAction(
  formData: FormData
): Promise<ActionResponse<{ userId: string }>> {
  const rawData = {
    token: formData.get('token'),
    full_name: formData.get('full_name'),
    email: formData.get('email'),
    password: formData.get('password'),
  };

  const parsed = acceptPatientInviteSchema.safeParse(rawData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message || 'Formulário inválido.' };
  }

  const tokenHash = hashInviteToken(parsed.data.token);
  const supabase = await createClient();

  // 1. Valida previamente o convite via RPC pública
  const { data: valData, error: valError } = await supabase.rpc('validate_patient_invite', {
    p_token_hash: tokenHash,
  });

  if (valError || !valData?.valid) {
    let msg = 'Convite inválido ou corrompido.';
    if (valData?.reason === 'expired') msg = 'Este convite expirou.';
    if (valData?.reason === 'revoked') msg = 'Este convite foi revogado.';
    if (valData?.reason === 'already_used') msg = 'Este convite já foi utilizado.';
    return { error: msg };
  }

  // 2. Cadastra o usuário no Supabase Auth passando o hash do convite no metadata.
  // O trigger handle_new_user() bloqueia e consome o convite e cria o vínculo atomicamente.
  // Qualquer falha provoca rollback total no PostgreSQL (zero contas órfãs).
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: {
        full_name: parsed.data.full_name,
        patient_invite_token_hash: tokenHash,
      },
    },
  });

  if (authError || !authData.user) {
    return { error: authError?.message || 'Erro ao registrar usuário através do convite.' };
  }

  return {
    success: true,
    data: { userId: authData.user.id },
  };
}

/**
 * Validação de token de convite de profissional.
 */
export async function validateProfessionalInviteTokenAction(
  rawToken: string
): Promise<ActionResponse<{
  valid: boolean;
  email?: string;
  roleId?: string;
  organizationName?: string;
  reason?: string;
}>> {
  try {
    const tokenHash = hashInviteToken(rawToken);
    const supabase = await createClient();

    const { data, error } = await supabase.rpc('validate_professional_invite', {
      p_token_hash: tokenHash,
    });

    if (error || !data) {
      return { success: false, error: 'Erro ao validar convite de profissional.' };
    }

    return {
      success: true,
      data: {
        valid: Boolean(data.valid),
        email: data.email,
        roleId: data.role_id,
        organizationName: data.organization_name,
        reason: data.reason,
      },
    };
  } catch {
    return { success: false, error: 'Token inválido ou corrompido.' };
  }
}

/**
 * Aceitação do convite de profissional de forma atômica no trigger.
 */
export async function acceptProfessionalInviteAction(
  formData: FormData
): Promise<ActionResponse<{ userId: string }>> {
  const token = formData.get('token')?.toString();
  const fullName = formData.get('full_name')?.toString();
  const email = formData.get('email')?.toString();
  const password = formData.get('password')?.toString();

  if (!token || !email || !password || !fullName) {
    return { error: 'Todos os campos são obrigatórios.' };
  }

  const tokenHash = hashInviteToken(token);
  const supabase = await createClient();

  // 1. Valida o convite
  const { data: valData, error: valError } = await supabase.rpc('validate_professional_invite', {
    p_token_hash: tokenHash,
  });

  if (valError || !valData?.valid) {
    let msg = 'Convite profissional inválido.';
    if (valData?.reason === 'expired') msg = 'Este convite expirou.';
    if (valData?.reason === 'revoked') msg = 'Este convite foi revogado.';
    if (valData?.reason === 'already_used') msg = 'Este convite já foi utilizado.';
    return { error: msg };
  }

  // 2. Cria o usuário com o hash do convite no metadata.
  // O trigger handle_new_user() provisiona o papel exato (nutritionist/influencer)
  // e cria os registros associados atomicamente. Rollback imediato se falhar.
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
        professional_invite_token_hash: tokenHash,
      },
    },
  });

  if (authError || !authData.user) {
    return { error: authError?.message || 'Erro ao ativar conta profissional.' };
  }

  return {
    success: true,
    data: { userId: authData.user.id },
  };
}
