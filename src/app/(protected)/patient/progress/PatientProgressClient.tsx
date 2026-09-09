'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useState, useTransition } from 'react';
import { Activity, AlertTriangle, ArrowLeft, Scale, ShieldCheck } from 'lucide-react';
import { ProgressDashboardData, recordPatientCheckInAction } from '@/app/actions/progress';

interface Props {
  initialData: ProgressDashboardData;
  initialError?: string;
}

const ratingLabels = ['Muito baixo', 'Baixo', 'Regular', 'Bom', 'Muito bom'];

function RatingField({ label, name }: { label: string; name: string }) {
  return (
    <label className="space-y-1.5 text-xs text-zinc-300">
      <span>{label}</span>
      <select name={name} defaultValue="" className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-white">
        <option value="">Não informar</option>
        {ratingLabels.map((rating, index) => <option key={rating} value={index + 1}>{index + 1} — {rating}</option>)}
      </select>
    </label>
  );
}

export function PatientProgressClient({ initialData, initialError }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(initialError ?? null);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const optionalNumber = (name: string) => {
      const value = form.get(name)?.toString();
      return value ? Number(value) : undefined;
    };

    startTransition(async () => {
      const result = await recordPatientCheckInAction({
        check_in_date: form.get('check_in_date')?.toString() ?? '',
        weight_kg: optionalNumber('weight_kg'),
        hunger_level: optionalNumber('hunger_level'),
        energy_level: optionalNumber('energy_level'),
        sleep_quality: optionalNumber('sleep_quality'),
        nutrition_adherence_rating: optionalNumber('nutrition_adherence_rating'),
        workout_adherence_rating: optionalNumber('workout_adherence_rating'),
        concerning_symptoms: form.get('concerning_symptoms') === 'on',
        notes: form.get('notes')?.toString() || undefined,
      });

      if (!result.success) {
        setMessage(result.error ?? 'Não foi possível registrar o check-in.');
        return;
      }
      setMessage(result.data?.analysis_pending
        ? 'Check-in salvo. A análise será reprocessada em seguida.'
        : 'Check-in salvo e progresso recalculado.');
      router.refresh();
    });
  };

  const metrics = initialData.latest_analysis?.metrics;

  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <div className="mx-auto max-w-5xl space-y-8 px-4 py-8 sm:px-6">
        <header className="flex items-start gap-4 border-b border-zinc-800 pb-6">
          <Link href="/patient" className="rounded-lg border border-zinc-800 p-2 text-zinc-400 hover:text-white"><ArrowLeft className="h-5 w-5" /></Link>
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-400"><Activity className="h-4 w-4" /> Progresso</div>
            <h1 className="mt-1 text-2xl font-bold">Seu acompanhamento contínuo</h1>
            <p className="mt-1 text-sm text-zinc-400">Registre como a rotina está funcionando. O sistema identifica padrões e encaminha revisões sem mudar seus planos sozinho.</p>
          </div>
        </header>

        {message && <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-200">{message}</div>}

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5"><span className="text-xs text-zinc-500">Check-ins analisados</span><div className="mt-1 text-2xl font-bold">{metrics?.check_in_count ?? 0}</div></div>
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5"><span className="text-xs text-zinc-500">Treinos realizados</span><div className="mt-1 text-2xl font-bold">{metrics?.workouts_completed ?? 0}</div></div>
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5"><span className="text-xs text-zinc-500">Variação de peso</span><div className="mt-1 text-2xl font-bold">{metrics?.weight_change_kg == null ? '—' : `${metrics.weight_change_kg > 0 ? '+' : ''}${metrics.weight_change_kg} kg`}</div></div>
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5"><span className="text-xs text-zinc-500">Qualidade dos dados</span><div className="mt-2 text-sm font-bold capitalize text-emerald-400">{initialData.latest_analysis?.data_quality ?? 'Aguardando dados'}</div></div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <form onSubmit={submit} className="space-y-5 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6">
            <div><h2 className="font-bold">Novo check-in</h2><p className="text-xs text-zinc-500">Escalas de 1 a 5. Você pode preencher apenas o que fizer sentido hoje.</p></div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-1.5 text-xs text-zinc-300"><span>Data</span><input required name="check_in_date" type="date" max={new Date().toISOString().slice(0, 10)} defaultValue={new Date().toISOString().slice(0, 10)} className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-white" /></label>
              <label className="space-y-1.5 text-xs text-zinc-300"><span>Peso atual (kg)</span><div className="relative"><Scale className="absolute left-3 top-3 h-4 w-4 text-zinc-600" /><input name="weight_kg" type="number" min="20" max="400" step="0.1" className="w-full rounded-lg border border-zinc-800 bg-zinc-950 py-2.5 pl-9 pr-3 text-white" /></div></label>
              <RatingField label="Fome ao longo do dia" name="hunger_level" />
              <RatingField label="Nível de energia" name="energy_level" />
              <RatingField label="Qualidade do sono" name="sleep_quality" />
              <RatingField label="Aderência à alimentação" name="nutrition_adherence_rating" />
              <RatingField label="Aderência ao treino" name="workout_adherence_rating" />
            </div>
            <label className="block space-y-1.5 text-xs text-zinc-300"><span>Observação opcional</span><textarea name="notes" maxLength={1000} rows={3} className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-white" placeholder="Conte o que facilitou ou dificultou sua rotina." /></label>
            <label className="flex items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-zinc-300"><input name="concerning_symptoms" type="checkbox" className="mt-0.5" /><span><strong className="text-amber-300">Quero sinalizar um sintoma ou desconforto preocupante.</strong><br />O registro gera encaminhamento para avaliação; o AppNutri não faz diagnóstico.</span></label>
            <button disabled={pending} className="rounded-xl bg-emerald-500 px-5 py-3 text-sm font-bold text-zinc-950 disabled:opacity-50">{pending ? 'Salvando…' : 'Registrar check-in'}</button>
          </form>

          <div className="space-y-6">
            <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6">
              <div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-400" /><h2 className="font-bold">Revisões identificadas</h2></div>
              <div className="mt-4 space-y-3">
                {initialData.proposals.length === 0 ? <p className="text-sm text-zinc-500">Nenhuma proposta de revisão no momento.</p> : initialData.proposals.slice(0, 6).map((proposal) => (
                  <div key={proposal.id} className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
                    <div className="flex items-center justify-between gap-2"><span className="text-xs font-bold uppercase text-zinc-400">{proposal.domain}</span><span className={proposal.priority === 'high' ? 'text-xs text-amber-400' : 'text-xs text-zinc-500'}>{proposal.status === 'pending_review' ? 'Aguardando revisão' : 'Revisada'}</span></div>
                    <p className="mt-2 text-sm text-zinc-300">{proposal.summary}</p>
                  </div>
                ))}
              </div>
            </section>
            <div className="flex gap-3 rounded-2xl border border-sky-500/20 bg-sky-500/5 p-4 text-xs text-sky-100"><AlertTriangle className="h-4 w-4 shrink-0 text-sky-400" /><p>Peso e escalas mostram tendências, não diagnósticos. Ajustes clínicos continuam sob responsabilidade do profissional habilitado.</p></div>
          </div>
        </section>

        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6">
          <h2 className="font-bold">Histórico recente</h2>
          <div className="mt-4 divide-y divide-zinc-800">
            {initialData.check_ins.length === 0 ? <p className="py-4 text-sm text-zinc-500">Seu primeiro check-in aparecerá aqui.</p> : initialData.check_ins.map((checkIn) => (
              <div key={checkIn.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"><span className="text-zinc-300">{new Date(`${checkIn.check_in_date}T12:00:00`).toLocaleDateString('pt-BR')}</span><div className="flex gap-4 text-xs text-zinc-500">{checkIn.weight_kg !== undefined && <span>{checkIn.weight_kg} kg</span>}{checkIn.hunger_level !== undefined && <span>Fome {checkIn.hunger_level}/5</span>}{checkIn.energy_level !== undefined && <span>Energia {checkIn.energy_level}/5</span>}</div>{checkIn.concerning_symptoms && <span className="inline-flex items-center gap-1 text-xs text-amber-400"><AlertTriangle className="h-3 w-3" /> Encaminhamento sinalizado</span>}</div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
