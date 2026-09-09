'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Activity, AlertTriangle, ArrowLeft, CheckCircle2, XCircle } from 'lucide-react';
import { ProgressDashboardData, reviewAdjustmentProposalAction } from '@/app/actions/progress';
import { UserRole } from '@/types/roles';

interface Props {
  patientId: string;
  role: UserRole;
  data: ProgressDashboardData;
}

export function ProfessionalProgressClient({ patientId, role, data }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const canReviewNutrition = role === 'nutritionist' || role === 'admin';

  const review = (proposalId: string, decision: 'accepted_for_review' | 'dismissed') => {
    startTransition(async () => {
      const result = await reviewAdjustmentProposalAction({ proposal_id: proposalId, decision });
      if (!result.success) {
        setError(result.error ?? 'Não foi possível revisar a proposta.');
        return;
      }
      setError(null);
      router.refresh();
    });
  };

  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <div className="mx-auto max-w-5xl space-y-7 px-4 py-8 sm:px-6">
        <header className="flex items-start gap-4 border-b border-zinc-800 pb-6">
          <Link href={`/professional/patients/${patientId}`} className="rounded-lg border border-zinc-800 p-2 text-zinc-400 hover:text-white"><ArrowLeft className="h-5 w-5" /></Link>
          <div><div className="flex items-center gap-2 text-xs font-bold uppercase text-emerald-400"><Activity className="h-4 w-4" /> Acompanhamento autorizado</div><h1 className="mt-1 text-2xl font-bold">Progresso do paciente</h1><p className="mt-1 text-sm text-zinc-400">Análises reproduzíveis e propostas de revisão. Aceitar uma proposta não altera a prescrição.</p></div>
        </header>

        {error && <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-200">{error}</div>}

        <section className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5"><div className="text-xs text-zinc-500">Check-ins</div><div className="mt-1 text-2xl font-bold">{data.latest_analysis?.metrics.check_in_count ?? 0}</div></div>
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5"><div className="text-xs text-zinc-500">Treinos realizados</div><div className="mt-1 text-2xl font-bold">{data.latest_analysis?.metrics.workouts_completed ?? 0}</div></div>
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5"><div className="text-xs text-zinc-500">Variação de peso</div><div className="mt-1 text-2xl font-bold">{data.latest_analysis?.metrics.weight_change_kg == null ? '—' : `${data.latest_analysis.metrics.weight_change_kg} kg`}</div></div>
        </section>

        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6">
          <h2 className="font-bold">Propostas de revisão</h2>
          <div className="mt-4 space-y-3">
            {data.proposals.length === 0 ? <p className="text-sm text-zinc-500">Nenhuma proposta registrada.</p> : data.proposals.map((proposal) => {
              const domainAuthorized = canReviewNutrition && proposal.domain !== 'workout';
              return (
                <div key={proposal.id} className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2"><span className="text-xs font-bold uppercase text-emerald-400">{proposal.domain}</span>{proposal.priority === 'high' && <span className="inline-flex items-center gap-1 text-xs text-amber-400"><AlertTriangle className="h-3 w-3" /> Alta prioridade</span>}</div><span className="text-xs text-zinc-500">{proposal.status}</span></div>
                  <p className="mt-2 text-sm text-zinc-300">{proposal.summary}</p>
                  {proposal.status === 'pending_review' && domainAuthorized && <div className="mt-3 flex gap-2"><button disabled={pending} onClick={() => review(proposal.id, 'accepted_for_review')} className="inline-flex items-center gap-1 rounded-lg bg-emerald-500 px-3 py-2 text-xs font-bold text-zinc-950"><CheckCircle2 className="h-3.5 w-3.5" /> Aceitar para análise</button><button disabled={pending} onClick={() => review(proposal.id, 'dismissed')} className="inline-flex items-center gap-1 rounded-lg border border-zinc-700 px-3 py-2 text-xs text-zinc-300"><XCircle className="h-3.5 w-3.5" /> Dispensar</button></div>}
                  {proposal.status === 'pending_review' && !domainAuthorized && <p className="mt-3 text-xs text-amber-400">Este domínio exige profissional habilitado com autoridade específica.</p>}
                </div>
              );
            })}
          </div>
        </section>

        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6"><h2 className="font-bold">Check-ins recentes</h2><div className="mt-4 divide-y divide-zinc-800">{data.check_ins.map((item) => <div key={item.id} className="flex flex-wrap justify-between gap-3 py-3 text-sm"><span>{new Date(`${item.check_in_date}T12:00:00`).toLocaleDateString('pt-BR')}</span><span className="text-xs text-zinc-500">{item.weight_kg ? `${item.weight_kg} kg` : 'Peso não informado'} · fome {item.hunger_level ?? '—'}/5 · energia {item.energy_level ?? '—'}/5</span></div>)}</div></section>
      </div>
    </main>
  );
}

