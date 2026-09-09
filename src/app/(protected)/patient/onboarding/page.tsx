import React from 'react';
import { requireRole } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { ClipboardList } from 'lucide-react';
import PatientOnboardingClient from './PatientOnboardingClient';

export default async function PatientOnboardingPage() {
  const user = await requireRole(['patient', 'admin']);
  const supabase = await createClient();

  const { data: onboarding } = await supabase
    .from('patient_onboarding')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();

  // Split name for prefill if not yet answered
  const nameParts = (user.profile.full_name || '').split(' ');
  const defaultFirstName = onboarding?.first_name || nameParts[0] || '';
  const defaultLastName = onboarding?.last_name || nameParts.slice(1).join(' ') || '';

  return (
    <div className="flex-1 max-w-2xl w-full mx-auto px-4 py-10 sm:px-6 space-y-8">
      <div className="border-b border-zinc-800 pb-6 text-center space-y-2">
        <div className="inline-flex items-center space-x-1.5 text-xs font-bold text-emerald-400 uppercase tracking-widest bg-emerald-500/10 px-2.5 py-1 rounded-md border border-emerald-500/20">
          <ClipboardList className="w-3.5 h-3.5" />
          <span>Questionário Inicial</span>
        </div>
        <h1 className="text-3xl font-extrabold text-white">Configuração do seu Perfil</h1>
        <p className="text-xs text-zinc-400 max-w-md mx-auto">
          Preencha seus dados básicos e objetivo principal para que seu profissional responsável possa acompanhar seu progresso.
        </p>
      </div>

      <PatientOnboardingClient
        initialData={onboarding}
        defaultFirstName={defaultFirstName}
        defaultLastName={defaultLastName}
      />
    </div>
  );
}
