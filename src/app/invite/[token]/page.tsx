import React from 'react';
import Link from 'next/link';
import { validatePatientInviteTokenAction } from '@/app/actions/invites';
import { ShieldAlert, HeartHandshake, Building2 } from 'lucide-react';
import PatientInviteForm from './PatientInviteForm';

interface Props {
  params: Promise<{ token: string }>;
}

export default async function PatientInvitePage({ params }: Props) {
  const { token } = await params;
  const validation = await validatePatientInviteTokenAction(token);

  if (!validation.success || !validation.data?.valid) {
    let reasonMessage = 'O link de convite para paciente não foi encontrado ou é inválido.';
    if (validation.data?.reason === 'already_used') {
      reasonMessage = 'Este convite já foi utilizado para vincular um paciente.';
    } else if (validation.data?.reason === 'expired') {
      reasonMessage = 'Este link de convite expirou. Solicite um novo link ao seu profissional.';
    } else if (validation.data?.reason === 'revoked') {
      reasonMessage = 'Este convite foi revogado pelo profissional.';
    }

    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-zinc-950">
        <div className="max-w-md w-full p-8 rounded-2xl border border-rose-900/40 bg-zinc-900/60 text-center space-y-5">
          <div className="w-12 h-12 mx-auto rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <h1 className="text-xl font-bold text-white">Convite Indisponível</h1>
          <p className="text-xs text-zinc-400 leading-relaxed">{reasonMessage}</p>
          <div className="pt-2">
            <Link
              href="/login"
              className="inline-block px-5 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold rounded-lg transition-colors"
            >
              Ir para o Login
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const { professionalName, professionalType, organizationName, email } = validation.data;
  const profTypeLabel = professionalType === 'influencer' ? 'Influenciador / Criador' : 'Nutricionista';

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-zinc-950">
      <div className="max-w-md w-full p-8 rounded-2xl border border-zinc-800 bg-zinc-900/60 backdrop-blur-md space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold">
            <HeartHandshake className="w-3.5 h-3.5" />
            <span>Convite de Acompanhamento</span>
          </div>
          <h1 className="text-2xl font-extrabold text-white">Criar Minha Conta</h1>
          <p className="text-xs text-zinc-400">
            Você foi convidado por <strong className="text-emerald-400 font-semibold">{professionalName || 'seu profissional'}</strong> ({profTypeLabel}).
          </p>
          {organizationName && (
            <div className="inline-flex items-center space-x-1.5 text-xs text-zinc-300 bg-zinc-800/60 px-3 py-1 rounded-md border border-zinc-700/50 mt-1">
              <Building2 className="w-3.5 h-3.5 text-zinc-400" />
              <span>{organizationName}</span>
            </div>
          )}
        </div>

        <PatientInviteForm token={token} defaultEmail={email || ''} />
      </div>
    </div>
  );
}
