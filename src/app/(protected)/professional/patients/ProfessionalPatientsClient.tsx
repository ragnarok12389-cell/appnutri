'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  UserPlus,
  Search,
  Check,
  Copy,
  AlertCircle,
  CheckCircle2,
  Trash2,
  Mail,
  Calendar,
  ExternalLink,
  Sparkles,
} from 'lucide-react';
import { createPatientInviteAction, revokePatientInviteAction } from '@/app/actions/invites';

interface PatientItem {
  linkId: string;
  patientId: string;
  fullName: string;
  email: string;
  joinedAt: string;
  status: string;
  isPrimary: boolean;
  organizationName: string | null;
  onboardingCompleted: boolean;
  primaryGoal: string | null;
}

interface PendingInvite {
  id: string;
  email: string | null;
  status: string;
  created_at: string;
  expires_at: string;
}

interface Props {
  initialPatients: PatientItem[];
  initialInvites: PendingInvite[];
}

const GOAL_LABELS: Record<string, string> = {
  lose_weight: 'Emagrecimento',
  gain_muscle: 'Hipertrofia',
  maintain_weight: 'Manutenção',
  improve_health: 'Saúde Geral',
  improve_performance: 'Performance Esportiva',
};

export default function ProfessionalPatientsClient({ initialPatients, initialInvites }: Props) {
  const router = useRouter();

  // Search & Filters
  const [searchTerm, setSearchTerm] = useState('');

  // Invite Generation State
  const [inviteEmail, setInviteEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Revoke state
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const filteredPatients = useMemo(() => {
    if (!searchTerm.trim()) return initialPatients;
    const term = searchTerm.toLowerCase();
    return initialPatients.filter(
      (p) => p.fullName.toLowerCase().includes(term) || p.email.toLowerCase().includes(term)
    );
  }, [initialPatients, searchTerm]);

  async function handleCreateInvite(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    setFeedback(null);
    setGeneratedLink(null);

    const res = await createPatientInviteAction({
      email: inviteEmail || undefined,
      expires_in_days: 7,
    });

    setIsSubmitting(false);

    if (res.error) {
      setFeedback({ type: 'error', message: res.error });
    } else if (res.data) {
      const fullUrl = `${window.location.origin}${res.data.inviteUrl}`;
      setGeneratedLink(fullUrl);
      setFeedback({
        type: 'success',
        message: 'Convite gerado com sucesso! Envie o link abaixo para o paciente.',
      });
      setInviteEmail('');
      router.refresh();
    }
  }

  async function handleRevokeInvite(inviteId: string) {
    if (!confirm('Deseja realmente revogar este convite? O link deixará de funcionar imediatamente.')) {
      return;
    }

    setRevokingId(inviteId);
    const res = await revokePatientInviteAction(inviteId);
    setRevokingId(null);

    if (res.error) {
      alert(res.error);
    } else {
      router.refresh();
    }
  }

  function handleCopyLink() {
    if (!generatedLink) return;
    navigator.clipboard.writeText(generatedLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  return (
    <div className="space-y-10">
      {/* Bloco de Geração de Convite de Paciente */}
      <div className="p-6 rounded-2xl border border-zinc-800 bg-zinc-900/50 backdrop-blur-sm space-y-6">
        <div className="flex items-center space-x-2.5">
          <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
            <UserPlus className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white">Gerar Convite de Paciente</h2>
            <p className="text-xs text-zinc-400">
              O paciente criará a conta a partir do link e será vinculado automaticamente a você de forma atômica no banco de dados.
            </p>
          </div>
        </div>

        <form onSubmit={handleCreateInvite} className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2 space-y-1.5">
            <label htmlFor="patient-email" className="text-xs font-semibold text-zinc-300">
              Email do Paciente (Opcional)
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-zinc-500 absolute left-3 top-3" />
              <input
                id="patient-email"
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="Deixe em branco para gerar um link de convite aberto"
                className="w-full pl-9 pr-3 py-2 text-sm bg-zinc-950 border border-zinc-800 rounded-lg text-white placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          <div className="flex items-end">
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-2.5 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-colors flex items-center justify-center space-x-2 disabled:opacity-50"
            >
              <Sparkles className="w-4 h-4" />
              <span>{isSubmitting ? 'Gerando Link...' : 'Gerar Convite de Paciente'}</span>
            </button>
          </div>
        </form>

        {feedback && (
          <div
            className={`p-4 rounded-xl flex items-start space-x-3 text-xs ${
              feedback.type === 'success'
                ? 'bg-emerald-950/40 text-emerald-300 border border-emerald-800/60'
                : 'bg-rose-950/40 text-rose-300 border border-rose-800/60'
            }`}
          >
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            )}
            <span>{feedback.message}</span>
          </div>
        )}

        {generatedLink && (
          <div className="p-4 rounded-xl bg-zinc-950 border border-emerald-500/30 space-y-2">
            <div className="text-xs font-semibold text-emerald-400">Link do Convite Gerado:</div>
            <div className="flex items-center space-x-2">
              <input
                type="text"
                readOnly
                value={generatedLink}
                className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-xs font-mono text-zinc-200 select-all"
              />
              <button
                onClick={handleCopyLink}
                className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg flex items-center space-x-1.5 transition-colors"
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copiado!' : 'Copiar Link'}</span>
              </button>
            </div>
            <p className="text-[11px] text-zinc-500">
              Válido por 7 dias. O vínculo com seu perfil profissional ocorrerá automaticamente na aceitação.
            </p>
          </div>
        )}
      </div>

      {/* Lista de Pacientes Vinculados */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-white">Pacientes Ativos</h2>
            <p className="text-xs text-zinc-400">
              {filteredPatients.length} de {initialPatients.length} pacientes vinculados
            </p>
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por nome ou email..."
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-zinc-950 border border-zinc-800 rounded-lg text-white placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500"
            />
          </div>
        </div>

        {filteredPatients.length === 0 ? (
          <div className="p-8 text-center rounded-xl border border-zinc-800 bg-zinc-900/30 text-zinc-500 text-sm">
            {searchTerm
              ? 'Nenhum paciente encontrado para a busca informada.'
              : 'Nenhum paciente vinculado à sua carteira ainda. Gere um convite acima para começar.'}
          </div>
        ) : (
          <div className="border border-zinc-800 rounded-xl overflow-hidden bg-zinc-900/30">
            <table className="w-full text-left text-xs text-zinc-300">
              <thead className="bg-zinc-950 text-zinc-400 uppercase font-semibold border-b border-zinc-800">
                <tr>
                  <th className="px-4 py-3">Paciente</th>
                  <th className="px-4 py-3">Entrada</th>
                  <th className="px-4 py-3">Objetivo Principal</th>
                  <th className="px-4 py-3">Onboarding</th>
                  <th className="px-4 py-3">Organização</th>
                  <th className="px-4 py-3 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {filteredPatients.map((patient) => (
                  <tr key={patient.patientId} className="hover:bg-zinc-900/50 transition-colors">
                    <td className="px-4 py-3.5">
                      <div className="font-semibold text-white">{patient.fullName}</div>
                      <div className="text-zinc-500 font-mono text-[11px]">{patient.email}</div>
                    </td>
                    <td className="px-4 py-3.5 text-zinc-400">
                      {new Date(patient.joinedAt).toLocaleDateString('pt-BR')}
                    </td>
                    <td className="px-4 py-3.5">
                      {patient.primaryGoal ? (
                        <span className="inline-block px-2 py-0.5 rounded bg-zinc-800 text-zinc-200 text-[11px] font-medium">
                          {GOAL_LABELS[patient.primaryGoal] || patient.primaryGoal}
                        </span>
                      ) : (
                        <span className="text-zinc-600">Não informado</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      {patient.onboardingCompleted ? (
                        <span className="text-emerald-400 font-medium">Concluído</span>
                      ) : (
                        <span className="text-amber-400 font-medium">Pendente</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-zinc-400">
                      {patient.organizationName || <span className="text-zinc-600">Direto</span>}
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <Link
                        href={`/professional/patients/${patient.patientId}`}
                        className="inline-flex items-center space-x-1 text-xs text-emerald-400 hover:text-emerald-300 font-semibold px-2.5 py-1 rounded bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors"
                      >
                        <span>Ver Ficha</span>
                        <ExternalLink className="w-3 h-3" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Convites de Pacientes Pendentes */}
      {initialInvites.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-bold text-white">Convites Pendentes</h2>
          <div className="border border-zinc-800 rounded-xl overflow-hidden bg-zinc-900/30">
            <table className="w-full text-left text-xs text-zinc-300">
              <thead className="bg-zinc-950 text-zinc-400 uppercase font-semibold border-b border-zinc-800">
                <tr>
                  <th className="px-4 py-3">Destinatário</th>
                  <th className="px-4 py-3">Criado Em</th>
                  <th className="px-4 py-3">Expira Em</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {initialInvites.map((inv) => (
                  <tr key={inv.id} className="hover:bg-zinc-900/40">
                    <td className="px-4 py-3 font-semibold text-white">
                      {inv.email || <span className="text-zinc-500 italic">Convite aberto</span>}
                    </td>
                    <td className="px-4 py-3 text-zinc-400">
                      <span className="inline-flex items-center space-x-1">
                        <Calendar className="w-3 h-3 text-zinc-500" />
                        <span>{new Date(inv.created_at).toLocaleDateString('pt-BR')}</span>
                      </span>
                    </td>
                    <td className="px-4 py-3 text-zinc-400">
                      {new Date(inv.expires_at).toLocaleDateString('pt-BR')}
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-500/10 text-amber-400 border border-amber-500/20">
                        {inv.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleRevokeInvite(inv.id)}
                        disabled={revokingId === inv.id}
                        className="inline-flex items-center space-x-1 text-xs text-rose-400 hover:text-rose-300 px-2 py-1 rounded border border-rose-900/50 hover:bg-rose-950/40 transition-colors"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>Revogar</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
