'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  UserPlus,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  Power,
  Mail,
  Building,
  Sparkles,
} from 'lucide-react';
import { createProfessionalInviteAction } from '@/app/actions/invites';
import { toggleProfessionalStatusAction } from '@/app/actions/professionals';

interface ProfessionalRecord {
  id: string;
  role_id: string;
  full_name: string;
  email: string;
  is_active: boolean;
  created_at: string;
  professional_profiles: {
    license_number: string | null;
    license_state: string | null;
    niche: string | null;
    is_onboarding_completed: boolean;
  } | {
    license_number: string | null;
    license_state: string | null;
    niche: string | null;
    is_onboarding_completed: boolean;
  }[] | null;
}

interface InviteRecord {
  id: string;
  email: string;
  role_id: string;
  organization_id: string | null;
  token_hash: string;
  expires_at: string;
  created_at: string;
}

interface OrganizationOption {
  id: string;
  name: string;
}

interface Props {
  initialProfessionals: ProfessionalRecord[];
  initialInvites: InviteRecord[];
  organizations: OrganizationOption[];
}

export default function AdminProfessionalsClient({
  initialProfessionals,
  initialInvites,
  organizations,
}: Props) {
  const router = useRouter();

  // Invite Form State
  const [email, setEmail] = useState('');
  const [roleId, setRoleId] = useState<'nutritionist' | 'influencer'>('nutritionist');
  const [orgId, setOrgId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Status toggle state
  const [togglingId, setTogglingId] = useState<string | null>(null);

  async function handleCreateInvite(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    setFeedback(null);
    setGeneratedLink(null);

    const res = await createProfessionalInviteAction({
      email,
      role_id: roleId,
      organization_id: orgId ? orgId : null,
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
        message: `Convite gerado com sucesso para ${email}! Copie o link abaixo.`,
      });
      setEmail('');
      router.refresh();
    }
  }

  async function handleToggleStatus(profId: string, currentStatus: boolean) {
    setTogglingId(profId);
    const res = await toggleProfessionalStatusAction(profId, !currentStatus);
    setTogglingId(null);

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
      {/* Formulário de Novo Convite */}
      <div className="p-6 rounded-2xl border border-zinc-800 bg-zinc-900/50 backdrop-blur-sm space-y-6">
        <div className="flex items-center space-x-2.5">
          <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
            <UserPlus className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white">Convidar Novo Profissional</h2>
            <p className="text-xs text-zinc-400">
              Gera um convite seguro com token criptográfico de uso único para provisionamento de Nutricionista ou Influenciador.
            </p>
          </div>
        </div>

        <form onSubmit={handleCreateInvite} className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <label htmlFor="invite-email" className="text-xs font-semibold text-zinc-300">
              Email do Profissional
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-zinc-500 absolute left-3 top-3" />
              <input
                id="invite-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="profissional@exemplo.com"
                className="w-full pl-9 pr-3 py-2 text-sm bg-zinc-950 border border-zinc-800 rounded-lg text-white placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="invite-role" className="text-xs font-semibold text-zinc-300">
              Papel / Especialidade
            </label>
            <select
              id="invite-role"
              value={roleId}
              onChange={(e) => setRoleId(e.target.value as 'nutritionist' | 'influencer')}
              className="w-full px-3 py-2 text-sm bg-zinc-950 border border-zinc-800 rounded-lg text-white focus:outline-none focus:border-emerald-500"
            >
              <option value="nutritionist">Nutricionista (Clínico / CRN)</option>
              <option value="influencer">Influenciador (Parceiro / Criador)</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="invite-org" className="text-xs font-semibold text-zinc-300">
              Organização (Opcional)
            </label>
            <div className="relative">
              <Building className="w-4 h-4 text-zinc-500 absolute left-3 top-3" />
              <select
                id="invite-org"
                value={orgId}
                onChange={(e) => setOrgId(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm bg-zinc-950 border border-zinc-800 rounded-lg text-white focus:outline-none focus:border-emerald-500"
              >
                <option value="">Nenhuma (Prática Autônoma)</option>
                {organizations.map((org) => (
                  <option key={org.id} value={org.id}>
                    {org.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="md:col-span-3 flex justify-end">
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center space-x-2 px-5 py-2.5 text-sm font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-colors disabled:opacity-50"
            >
              <Sparkles className="w-4 h-4" />
              <span>{isSubmitting ? 'Gerando Convite...' : 'Gerar Convite Seguro'}</span>
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
              Este link contém o token criptográfico único. O hash SHA-256 foi salvo de forma segura no banco de dados.
            </p>
          </div>
        )}
      </div>

      {/* Lista de Profissionais Ativos / Inativos */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">Profissionais Cadastrados</h2>
          <span className="text-xs font-medium text-zinc-400">
            Total: {initialProfessionals.length} profissionais
          </span>
        </div>

        {initialProfessionals.length === 0 ? (
          <div className="p-8 text-center rounded-xl border border-zinc-800 bg-zinc-900/30 text-zinc-500 text-sm">
            Nenhum profissional cadastrado ainda. Use o formulário acima para convidar o primeiro nutricionista ou influenciador.
          </div>
        ) : (
          <div className="border border-zinc-800 rounded-xl overflow-hidden bg-zinc-900/30">
            <table className="w-full text-left text-xs text-zinc-300">
              <thead className="bg-zinc-950 text-zinc-400 uppercase font-semibold border-b border-zinc-800">
                <tr>
                  <th className="px-4 py-3">Profissional</th>
                  <th className="px-4 py-3">Papel</th>
                  <th className="px-4 py-3">Registro / Nicho</th>
                  <th className="px-4 py-3">Onboarding</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {initialProfessionals.map((prof) => {
                  const profData = Array.isArray(prof.professional_profiles)
                    ? prof.professional_profiles[0]
                    : prof.professional_profiles;

                  return (
                    <tr key={prof.id} className="hover:bg-zinc-900/50 transition-colors">
                      <td className="px-4 py-3.5">
                        <div className="font-semibold text-white">{prof.full_name}</div>
                        <div className="text-zinc-500 font-mono text-[11px]">{prof.email}</div>
                      </td>
                      <td className="px-4 py-3.5">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[11px] font-bold uppercase ${
                            prof.role_id === 'nutritionist'
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              : 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                          }`}
                        >
                          {prof.role_id === 'nutritionist' ? 'Nutricionista' : 'Influenciador'}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-zinc-400">
                        {prof.role_id === 'nutritionist' ? (
                          profData?.license_number ? (
                            <span>{profData.license_number} ({profData.license_state || 'BR'})</span>
                          ) : (
                            <span className="text-zinc-600">Não informado</span>
                          )
                        ) : (
                          profData?.niche || <span className="text-zinc-600">Geral</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        {profData?.is_onboarding_completed ? (
                          <span className="text-emerald-400 font-medium">Concluído</span>
                        ) : (
                          <span className="text-amber-400 font-medium">Pendente</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        <span
                          className={`inline-flex items-center space-x-1 font-semibold ${
                            prof.is_active ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              prof.is_active ? 'bg-emerald-400' : 'bg-rose-400'
                            }`}
                          />
                          <span>{prof.is_active ? 'Ativo' : 'Inativo'}</span>
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <button
                          onClick={() => handleToggleStatus(prof.id, prof.is_active)}
                          disabled={togglingId === prof.id}
                          className={`inline-flex items-center space-x-1 text-xs px-2.5 py-1 rounded border transition-colors ${
                            prof.is_active
                              ? 'text-rose-400 border-rose-900/50 hover:bg-rose-950/40'
                              : 'text-emerald-400 border-emerald-900/50 hover:bg-emerald-950/40'
                          }`}
                        >
                          <Power className="w-3 h-3" />
                          <span>{prof.is_active ? 'Desativar' : 'Ativar'}</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Convites de Profissionais Pendentes */}
      {initialInvites.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-bold text-white">Convites Profissionais Pendentes</h2>
          <div className="border border-zinc-800 rounded-xl overflow-hidden bg-zinc-900/30">
            <table className="w-full text-left text-xs text-zinc-300">
              <thead className="bg-zinc-950 text-zinc-400 uppercase font-semibold border-b border-zinc-800">
                <tr>
                  <th className="px-4 py-3">Email Convidado</th>
                  <th className="px-4 py-3">Papel</th>
                  <th className="px-4 py-3">Data de Envio</th>
                  <th className="px-4 py-3">Expira Em</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {initialInvites.map((inv) => (
                  <tr key={inv.id} className="hover:bg-zinc-900/40">
                    <td className="px-4 py-3 font-semibold text-white">{inv.email}</td>
                    <td className="px-4 py-3">
                      <span className="capitalize text-zinc-300">{inv.role_id}</span>
                    </td>
                    <td className="px-4 py-3 text-zinc-400">
                      {new Date(inv.created_at).toLocaleDateString('pt-BR')}
                    </td>
                    <td className="px-4 py-3 text-zinc-400">
                      {new Date(inv.expires_at).toLocaleDateString('pt-BR')}
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
