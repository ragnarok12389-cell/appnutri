import React from 'react';
import Link from 'next/link';
import { requireRole } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { ShieldCheck, ArrowLeft } from 'lucide-react';
import AdminProfessionalsClient from './AdminProfessionalsClient';

export default async function AdminProfessionalsPage() {
  await requireRole('admin');
  const supabase = await createClient();

  // Busca todos os profissionais cadastrados
  const { data: professionals } = await supabase
    .from('profiles')
    .select(`
      id,
      role_id,
      full_name,
      email,
      is_active,
      created_at,
      professional_profiles (
        license_number,
        license_state,
        niche,
        is_onboarding_completed
      )
    `)
    .in('role_id', ['nutritionist', 'influencer'])
    .order('created_at', { ascending: false });

  // Busca convites pendentes de profissionais
  const { data: pendingInvites } = await supabase
    .from('professional_invites')
    .select('*')
    .is('accepted_at', null)
    .is('revoked_at', null)
    .order('created_at', { ascending: false });

  // Busca organizações existentes para seleção opcional
  const { data: organizations } = await supabase
    .from('organizations')
    .select('id, name')
    .order('name');

  return (
    <div className="flex-1 max-w-6xl w-full mx-auto px-4 py-10 sm:px-6 lg:px-8 space-y-8">
      <div className="border-b border-rose-900/30 pb-6 flex items-start justify-between">
        <div>
          <div className="inline-flex items-center space-x-1.5 text-xs font-bold text-rose-400 uppercase tracking-widest bg-rose-500/10 px-2.5 py-1 rounded-md border border-rose-500/20">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Painel Administrativo</span>
          </div>
          <h1 className="text-3xl font-extrabold text-white mt-2">Provisionamento de Profissionais</h1>
          <p className="text-xs text-zinc-400 mt-1">
            Gestão de acessos, convites criptográficos e papéis autorizados para Nutricionistas e Influenciadores.
          </p>
        </div>
        <Link
          href="/admin"
          className="inline-flex items-center space-x-1.5 text-xs text-zinc-400 hover:text-zinc-200 border border-zinc-800 bg-zinc-900 px-3 py-1.5 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Voltar</span>
        </Link>
      </div>

      <AdminProfessionalsClient
        initialProfessionals={professionals || []}
        initialInvites={pendingInvites || []}
        organizations={organizations || []}
      />
    </div>
  );
}
