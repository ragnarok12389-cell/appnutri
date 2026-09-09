import React from 'react';
import Link from 'next/link';
import { requireRole } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { Stethoscope, Sparkles, ArrowLeft } from 'lucide-react';
import ProfessionalOnboardingClient from './ProfessionalOnboardingClient';

export default async function ProfessionalOnboardingPage() {
  const user = await requireRole(['nutritionist', 'influencer']);
  const isNutri = user.profile.role_id === 'nutritionist';
  const supabase = await createClient();

  const { data: profProfile } = await supabase
    .from('professional_profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();

  return (
    <div className="flex-1 max-w-2xl w-full mx-auto px-4 py-10 sm:px-6 space-y-8">
      <div className="border-b border-zinc-800 pb-6 flex items-start justify-between">
        <div>
          <div className="inline-flex items-center space-x-1.5 text-xs font-bold text-emerald-400 uppercase tracking-widest bg-emerald-500/10 px-2.5 py-1 rounded-md border border-emerald-500/20">
            {isNutri ? <Stethoscope className="w-3.5 h-3.5" /> : <Sparkles className="w-3.5 h-3.5" />}
            <span>Cadastro Profissional</span>
          </div>
          <h1 className="text-3xl font-extrabold text-white mt-2">
            Complete seu Perfil {isNutri ? 'de Nutricionista' : 'de Influenciador'}
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            {isNutri
              ? 'Informe seu registro profissional CRN e especialidades para identificação de seus pacientes.'
              : 'Informe seu nicho de atuação e canais para apresentação institucional aos seus seguidores.'}
          </p>
        </div>
        <Link
          href="/professional"
          className="inline-flex items-center space-x-1.5 text-xs text-zinc-400 hover:text-zinc-200 border border-zinc-800 bg-zinc-900 px-3 py-1.5 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Voltar</span>
        </Link>
      </div>

      <ProfessionalOnboardingClient
        roleId={user.profile.role_id as 'nutritionist' | 'influencer'}
        initialProfile={profProfile}
      />
    </div>
  );
}
