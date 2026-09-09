import React from 'react';
import Link from 'next/link';
import { requireRole } from '@/lib/auth/guards';
import { RoleBadge } from '@/components/ui/RoleBadge';
import { Stethoscope, Sparkles, UserCheck, ShieldAlert, ArrowLeft, Database } from 'lucide-react';

export default async function ProfessionalPage() {
  const user = await requireRole(['nutritionist', 'influencer']);
  const isNutri = user.profile.role_id === 'nutritionist';

  return (
    <div className="flex-1 max-w-5xl w-full mx-auto px-4 py-10 sm:px-6 lg:px-8 space-y-8">
      {/* Header */}
      <div className="border-b border-zinc-800/80 pb-6 flex items-start justify-between">
        <div>
          <div className="inline-flex items-center space-x-1.5 text-xs font-bold text-emerald-400 uppercase tracking-widest bg-emerald-500/10 px-2.5 py-1 rounded-md border border-emerald-500/20">
            {isNutri ? <Stethoscope className="w-3.5 h-3.5" /> : <Sparkles className="w-3.5 h-3.5" />}
            <span>Área Profissional</span>
          </div>
          <h1 className="text-3xl font-extrabold text-white mt-2">
            Painel do {isNutri ? 'Nutricionista' : 'Influenciador'}
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Gestão restrita aos pacientes explicitamente vinculados através de <code className="text-zinc-300">professional_patient_links</code>.
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <RoleBadge role={user.profile.role_id} />
          <Link
            href="/dashboard"
            className="text-xs text-zinc-400 hover:text-zinc-200 border border-zinc-800 bg-zinc-900 px-3 py-1.5 rounded-lg transition-colors flex items-center space-x-1"
          >
            <ArrowLeft className="w-3 h-3" />
            <span>Dashboard</span>
          </Link>
        </div>
      </div>

      {/* Ações Rápidas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link
          href="/professional/patients"
          className="p-5 rounded-xl border border-emerald-500/30 bg-emerald-950/20 hover:bg-emerald-950/40 transition-colors flex items-center justify-between group"
        >
          <div className="space-y-1">
            <div className="text-sm font-bold text-white flex items-center space-x-2">
              <UserCheck className="w-4 h-4 text-emerald-400" />
              <span>Gerenciar Pacientes & Convites</span>
            </div>
            <p className="text-xs text-zinc-400">
              Gere convites criptográficos e acompanhe sua carteira de pacientes vinculados.
            </p>
          </div>
          <ArrowLeft className="w-4 h-4 text-emerald-400 rotate-180 group-hover:translate-x-1 transition-transform" />
        </Link>

        <Link
          href="/professional/onboarding"
          className="p-5 rounded-xl border border-zinc-800 bg-zinc-900/40 hover:bg-zinc-900/70 transition-colors flex items-center justify-between group"
        >
          <div className="space-y-1">
            <div className="text-sm font-bold text-white flex items-center space-x-2">
              <Sparkles className="w-4 h-4 text-purple-400" />
              <span>Completar Perfil Profissional</span>
            </div>
            <p className="text-xs text-zinc-400">
              Atualize seu registro {isNutri ? 'CRN e especialidades' : 'nicho e redes sociais'}.
            </p>
          </div>
          <ArrowLeft className="w-4 h-4 text-zinc-400 rotate-180 group-hover:translate-x-1 transition-transform" />
        </Link>

        {isNutri && (
          <Link
            href="/professional/foods"
            className="p-5 rounded-xl border border-sky-500/30 bg-sky-950/20 hover:bg-sky-950/40 transition-colors flex items-center justify-between group sm:col-span-2"
          >
            <div className="space-y-1">
              <div className="text-sm font-bold text-white flex items-center space-x-2">
                <Database className="w-4 h-4 text-sky-400" />
                <span>Consulta Clínica de Alimentos (TACO)</span>
              </div>
              <p className="text-xs text-zinc-400">
                Consulte nutrientes oficiais da TACO 4ª edição, simule porções caseiras e avalie custo nutricional.
              </p>
            </div>
            <ArrowLeft className="w-4 h-4 text-sky-400 rotate-180 group-hover:translate-x-1 transition-transform" />
          </Link>
        )}
      </div>

      {/* Diferenciação de Papel */}
      <div className={`p-6 rounded-xl border ${isNutri ? 'border-emerald-500/30 bg-emerald-950/10' : 'border-violet-500/30 bg-violet-950/10'} space-y-3`}>
        <h2 className="text-sm font-bold text-white flex items-center space-x-2">
          {isNutri ? <Stethoscope className="w-4 h-4 text-emerald-400" /> : <Sparkles className="w-4 h-4 text-violet-400" />}
          <span>Diferenciação Arquitetural: {isNutri ? 'Perfil Clínico' : 'Perfil Influencer'}</span>
        </h2>
        <p className="text-xs text-zinc-300 leading-relaxed">
          {isNutri
            ? 'Como Nutricionista credenciado, seu perfil possui permissões clínicas para criar e editar dietas. A prescrição de treino exige profissional de Educação Física habilitado.'
            : 'Como Influenciador, seu perfil gerencia comunidades e referências de alunos. A prescrição clínica não é permitida por padrão via RBAC.'}
        </p>
      </div>

      {/* Regra de Isolamento de Pacientes */}
      <div className="p-6 rounded-xl border border-zinc-800 bg-zinc-900/40 space-y-4">
        <h3 className="text-sm font-bold text-zinc-200 flex items-center space-x-2">
          <UserCheck className="w-4 h-4 text-sky-400" />
          <span>Modelo de Associação Profissional ↔ Paciente</span>
        </h3>
        <p className="text-xs text-zinc-400 leading-relaxed">
          A associação entre profissional e paciente não utiliza chaves simples e frágeis como <code className="text-zinc-300">patient.professional_id</code>.
          Utilizamos a entidade relacional <code className="text-zinc-300">professional_patient_links</code>, o que permite:
        </p>

        <ul className="text-xs text-zinc-300 space-y-2 list-disc list-inside">
          <li>Definir profissional titular principal (<code className="text-zinc-400">is_primary = true</code>)</li>
          <li>Suportar múltiplos profissionais assistentes por paciente</li>
          <li>Histórico de transferências com status (<code className="text-zinc-400">active, transferred, inactive</code>)</li>
          <li>Isolamento de banco via RLS através da função <code className="text-zinc-400">can_access_patient()</code></li>
        </ul>
      </div>

      {/* Alerta de Segurança IDOR */}
      <div className="p-4 rounded-lg border border-amber-500/20 bg-amber-500/5 flex items-start space-x-3 text-amber-300 text-xs">
        <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" />
        <div>
          <span className="font-bold">Proteção contra IDOR Ativa:</span> Qualquer tentativa de consultar um paciente cujo vínculo não esteja ativo para seu ID de usuário resultará em zero linhas retornadas diretamente pelo PostgreSQL via Row Level Security.
        </div>
      </div>
    </div>
  );
}
