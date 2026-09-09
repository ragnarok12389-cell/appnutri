'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { loginSchema, registerSchema } from '@/lib/validations/auth';
import { logAuditEvent } from '@/lib/audit/logger';

export interface ActionState {
  error?: string | null;
  success?: boolean;
}

export async function loginAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const rawData = {
    email: formData.get('email'),
    password: formData.get('password'),
  };

  const parsed = loginSchema.safeParse(rawData);
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message || 'Dados inválidos.',
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error || !data.user) {
    return {
      error: error?.message || 'Falha ao realizar login. Verifique suas credenciais.',
    };
  }

  // Registra auditoria de login
  await logAuditEvent({
    actorId: data.user.id,
    action: 'auth.login',
    entityType: 'session',
    entityId: data.user.id,
    metadata: { email: data.user.email },
  });

  redirect('/dashboard');
}

export async function registerAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const rawData = {
    fullName: formData.get('fullName'),
    email: formData.get('email'),
    password: formData.get('password'),
  };

  const parsed = registerSchema.safeParse(rawData);
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message || 'Dados de cadastro inválidos.',
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: {
        full_name: parsed.data.fullName,
        role_id: 'patient',
      },
    },
  });

  if (error || !data.user) {
    return {
      error: error?.message || 'Não foi possível concluir o cadastro.',
    };
  }

  // Registra auditoria de cadastro
  await logAuditEvent({
    actorId: data.user.id,
    action: 'auth.signup',
    entityType: 'profile',
    entityId: data.user.id,
    metadata: {
      email: data.user.email,
      role: 'patient',
    },
  });

  redirect('/dashboard');
}

export async function logoutAction() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (user) {
    await logAuditEvent({
      actorId: user.id,
      action: 'auth.logout',
      entityType: 'session',
      entityId: user.id,
    });
  }

  await supabase.auth.signOut();
  redirect('/login');
}
