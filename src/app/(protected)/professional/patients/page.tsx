import React from 'react';
import Link from 'next/link';
import { requireRole } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { Users, ArrowLeft } from 'lucide-react';
import ProfessionalPatientsClient from './ProfessionalPatientsClient';

export default async function ProfessionalPatientsPage() {
  const user = await requireRole(['nutritionist', 'influencer', 'admin']);
  const supabase = await createClient();

  // 1. Busca os vínculos ativos deste profissional
  const { data: rawLinks } = await supabase
    .from('professional_patient_links')
    .select(`
      id,
      patient_id,
      status,
      is_primary,
      link_type,
      created_at,
      patients (
        id,
        profiles (
          id,
          full_name,
          email,
          created_at
        )
      ),
      organizations (
        id,
        name
      )
    `)
    .eq('professional_id', user.id)
    .eq('status', 'active')
    .order('created_at', { ascending: false });

  // 2. Busca o status de onboarding dos pacientes vinculados
  const patientIds = (rawLinks || []).map((l) => l.patient_id);
  let onboardingMap: Record<string, { primary_goal: string; is_completed: boolean }> = {};

  if (patientIds.length > 0) {
    const { data: onboardings } = await supabase
      .from('patient_onboarding')
      .select('id, primary_goal, is_completed')
      .in('id', patientIds);

    if (onboardings) {
      onboardingMap = Object.fromEntries(
        onboardings.map((o) => [o.id, { primary_goal: o.primary_goal, is_completed: o.is_completed }])
      );
    }
  }

  // 3. Monta a lista formatada de pacientes
  const formattedPatients = (rawLinks || []).map((link) => {
    const pat = link.patients as unknown as {
      id: string;
      profiles: { full_name: string; email: string; created_at: string } | null;
    } | null;
    const org = link.organizations as unknown as { id: string; name: string } | null;
    const ob = onboardingMap[link.patient_id];

    return {
      linkId: link.id,
      patientId: link.patient_id,
      fullName: pat?.profiles?.full_name || 'Paciente',
      email: pat?.profiles?.email || 'N/A',
      joinedAt: link.created_at,
      status: link.status,
      isPrimary: link.is_primary,
      organizationName: org?.name || null,
      onboardingCompleted: ob?.is_completed || false,
      primaryGoal: ob?.primary_goal || null,
    };
  });

  // 4. Busca os convites de pacientes pendentes gerados pelo profissional
  const { data: pendingInvites } = await supabase
    .from('patient_invites')
    .select('id, email, status, created_at, expires_at')
    .eq('professional_id', user.id)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  return (
    <div className="flex-1 max-w-6xl w-full mx-auto px-4 py-10 sm:px-6 lg:px-8 space-y-8">
      <div className="border-b border-zinc-800 pb-6 flex items-start justify-between">
        <div>
          <div className="inline-flex items-center space-x-1.5 text-xs font-bold text-emerald-400 uppercase tracking-widest bg-emerald-500/10 px-2.5 py-1 rounded-md border border-emerald-500/20">
            <Users className="w-3.5 h-3.5" />
            <span>Gestão de Carteira</span>
          </div>
          <h1 className="text-3xl font-extrabold text-white mt-2">Meus Pacientes Vinculados</h1>
          <p className="text-xs text-zinc-400 mt-1">
            Geração de convites seguros, acompanhamento de ingressos e gestão de vínculos autorizados via RLS.
          </p>
        </div>
        <Link
          href="/professional"
          className="inline-flex items-center space-x-1.5 text-xs text-zinc-400 hover:text-zinc-200 border border-zinc-800 bg-zinc-900 px-3 py-1.5 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Voltar ao Painel</span>
        </Link>
      </div>

      <ProfessionalPatientsClient
        initialPatients={formattedPatients}
        initialInvites={pendingInvites || []}
      />
    </div>
  );
}
