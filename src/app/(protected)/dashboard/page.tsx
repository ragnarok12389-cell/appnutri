import React from 'react';
import Link from 'next/link';
import { requireAuth } from '@/lib/auth/guards';
import { RoleBadge } from '@/components/ui/RoleBadge';
import { User, Mail, Shield, Building2, Key, ArrowUpRight } from 'lucide-react';

export default async function DashboardPage() {
  const user = await requireAuth();

  return (
    <div className="flex-1 max-w-5xl w-full mx-auto px-4 py-10 sm:px-6 lg:px-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-zinc-800/80 pb-6">
        <div>
          <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">Painel Autenticado</span>
          <h1 className="text-3xl font-extrabold text-white mt-1">Dashboard</h1>
          <p className="text-xs text-zinc-400 mt-1">
            Visualização da sessão autenticada e validação de contexto multi-tenant
          </p>
        </div>
        <div>
          <RoleBadge role={user.profile.role_id} className="text-sm px-3 py-1.5" />
        </div>
      </div>

      {/* Grid de Informações do Usuário */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Card: Perfil Geral */}
        <div className="p-6 rounded-xl border border-zinc-800 bg-zinc-900/50 space-y-4">
          <h2 className="text-sm font-bold text-zinc-200 flex items-center space-x-2">
            <User className="w-4 h-4 text-emerald-400" />
            <span>Dados da Conta</span>
          </h2>
          
          <div className="space-y-3 text-xs">
            <div className="flex justify-between border-b border-zinc-800/60 pb-2">
              <span className="text-zinc-500">Nome:</span>
              <span className="font-semibold text-zinc-200">{user.profile.full_name}</span>
            </div>
            <div className="flex justify-between border-b border-zinc-800/60 pb-2">
              <span className="text-zinc-500 flex items-center space-x-1">
                <Mail className="w-3.5 h-3.5" />
                <span>Email:</span>
              </span>
              <span className="font-semibold text-zinc-200">{user.email}</span>
            </div>
            <div className="flex justify-between border-b border-zinc-800/60 pb-2">
              <span className="text-zinc-500 flex items-center space-x-1">
                <Shield className="w-3.5 h-3.5" />
                <span>Papel do Usuário:</span>
              </span>
              <span className="font-semibold text-zinc-200 capitalize">{user.profile.role_id}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">ID Seguro:</span>
              <span className="font-mono text-[11px] text-zinc-400 truncate max-w-[200px]">{user.id}</span>
            </div>
          </div>
        </div>

        {/* Card: Organização Atual */}
        <div className="p-6 rounded-xl border border-zinc-800 bg-zinc-900/50 space-y-4">
          <h2 className="text-sm font-bold text-zinc-200 flex items-center space-x-2">
            <Building2 className="w-4 h-4 text-sky-400" />
            <span>Organização Atual</span>
          </h2>

          {user.currentOrganization ? (
            <div className="space-y-3 text-xs">
              <div className="flex justify-between border-b border-zinc-800/60 pb-2">
                <span className="text-zinc-500">Nome:</span>
                <span className="font-semibold text-zinc-200">{user.currentOrganization.name}</span>
              </div>
              <div className="flex justify-between border-b border-zinc-800/60 pb-2">
                <span className="text-zinc-500">Slug:</span>
                <span className="font-mono text-zinc-300">@{user.currentOrganization.slug}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">ID da Organização:</span>
                <span className="font-mono text-[11px] text-zinc-400 truncate max-w-[200px]">
                  {user.currentOrganization.id}
                </span>
              </div>
            </div>
          ) : (
            <div className="text-xs text-zinc-400 space-y-2 py-4">
              <p>Nenhuma organização vinculada no momento (Operação em modo Profissional Solo ou Paciente Individual).</p>
              <p className="text-[11px] text-zinc-500">
                A arquitetura multi-tenant suporta criação de clínicas e equipes sem refatoração do modelo de domínio.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Áreas de Teste de Autorização */}
      <div className="p-6 rounded-xl border border-zinc-800/80 bg-zinc-900/30 space-y-4">
        <h2 className="text-sm font-bold text-zinc-200 flex items-center space-x-2">
          <Key className="w-4 h-4 text-amber-400" />
          <span>Teste de Proteção de Rotas & RBAC</span>
        </h2>
        <p className="text-xs text-zinc-400">
          Tente acessar as áreas abaixo para validar as regras do middleware e os guards server-side:
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
          <Link
            href="/admin"
            className="p-4 rounded-lg border border-zinc-800 hover:border-rose-500/50 bg-zinc-950/60 transition-all group flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-rose-400">/admin</span>
                <ArrowUpRight className="w-3.5 h-3.5 text-zinc-500 group-hover:text-rose-400 transition-colors" />
              </div>
              <p className="text-[11px] text-zinc-400 mt-1">
                Exclusivo para ADMIN. Outros usuários recebem 403.
              </p>
            </div>
          </Link>

          <Link
            href="/professional"
            className="p-4 rounded-lg border border-zinc-800 hover:border-emerald-500/50 bg-zinc-950/60 transition-all group flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-emerald-400">/professional</span>
                <ArrowUpRight className="w-3.5 h-3.5 text-zinc-500 group-hover:text-emerald-400 transition-colors" />
              </div>
              <p className="text-[11px] text-zinc-400 mt-1">
                Apenas NUTRITIONIST ou INFLUENCER.
              </p>
            </div>
          </Link>

          <Link
            href="/patient"
            className="p-4 rounded-lg border border-zinc-800 hover:border-sky-500/50 bg-zinc-950/60 transition-all group flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-sky-400">/patient</span>
                <ArrowUpRight className="w-3.5 h-3.5 text-zinc-500 group-hover:text-sky-400 transition-colors" />
              </div>
              <p className="text-[11px] text-zinc-400 mt-1">
                Exclusivo para PATIENT. Acesso aos próprios dados.
              </p>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}
