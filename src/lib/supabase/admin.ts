import { createClient as createSupabaseClient } from '@supabase/supabase-js';

/**
 * Cliente de administração com Service Role Key.
 * ATENÇÃO: NUNCA deve ser importado ou executado no browser.
 * Utilizado exclusivamente em Server Actions, Route Handlers ou scripts de backend para tarefas de sistema.
 */
export function createAdminClient() {
  if (typeof window !== 'undefined') {
    throw new Error('VIOLAÇÃO CRÍTICA DE SEGURANÇA: O cliente Supabase Admin (Service Role) não pode ser executado no navegador.');
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Configuração incompleta: SUPABASE_SERVICE_ROLE_KEY não está presente nas variáveis de ambiente.');
  }

  return createSupabaseClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
