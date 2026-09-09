import React from 'react';
import Link from 'next/link';
import { requireRole } from '@/lib/auth/guards';
import { ShieldCheck, Database, ListChecks, Users, History } from 'lucide-react';

export default async function AdminPage() {
  const user = await requireRole('admin');

  return (
    <div className="flex-1 max-w-5xl w-full mx-auto px-4 py-10 sm:px-6 lg:px-8 space-y-8">
      {/* Header */}
      <div className="border-b border-rose-900/30 pb-6 flex items-start justify-between">
        <div>
          <div className="inline-flex items-center space-x-1.5 text-xs font-bold text-rose-400 uppercase tracking-widest bg-rose-500/10 px-2.5 py-1 rounded-md border border-rose-500/20">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Painel Administrativo Restrito</span>
          </div>
          <h1 className="text-3xl font-extrabold text-white mt-2">Área de Governança e Auditoria</h1>
          <p className="text-xs text-zinc-400 mt-1">
            Esta rota só pode ser acessada por usuários com o papel ADMIN verificado no backend.
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Link
            href="/admin/foods"
            className="text-xs text-sky-400 hover:text-sky-300 border border-sky-500/30 bg-sky-950/30 px-3 py-1.5 rounded-lg transition-colors font-semibold"
          >
            Catálogo de Alimentos (TACO)
          </Link>
          <Link
            href="/admin/professionals"
            className="text-xs text-emerald-400 hover:text-emerald-300 border border-emerald-500/30 bg-emerald-950/30 px-3 py-1.5 rounded-lg transition-colors font-semibold"
          >
            Provisionar Profissionais
          </Link>
          <Link
            href="/dashboard"
            className="text-xs text-zinc-400 hover:text-zinc-200 border border-zinc-800 bg-zinc-900 px-3 py-1.5 rounded-lg transition-colors"
          >
            Voltar ao Dashboard
          </Link>
        </div>
      </div>

      {/* Cards de Governança */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-5 rounded-xl border border-zinc-800 bg-zinc-900/40 space-y-2">
          <Users className="w-5 h-5 text-emerald-400" />
          <h2 className="text-sm font-bold text-zinc-200">Papéis do Sistema</h2>
          <p className="text-xs text-zinc-400">
            4 papéis configurados: <code className="text-zinc-300">admin</code>, <code className="text-zinc-300">nutritionist</code>, <code className="text-zinc-300">influencer</code>, <code className="text-zinc-300">patient</code>.
          </p>
        </div>

        <div className="p-5 rounded-xl border border-zinc-800 bg-zinc-900/40 space-y-2">
          <ListChecks className="w-5 h-5 text-sky-400" />
          <h2 className="text-sm font-bold text-zinc-200">Permissões Granulares</h2>
          <p className="text-xs text-zinc-400">
            RBAC estruturado com suporte a concessão ou revogação de permissões por usuário (<code className="text-zinc-300">user_permissions</code>).
          </p>
        </div>

        <div className="p-5 rounded-xl border border-zinc-800 bg-zinc-900/40 space-y-2">
          <History className="w-5 h-5 text-rose-400" />
          <h2 className="text-sm font-bold text-zinc-200">Logs de Auditoria</h2>
          <p className="text-xs text-zinc-400">
            Apenas administradores possuem acesso de leitura às políticas da tabela <code className="text-zinc-300">audit_logs</code>.
          </p>
        </div>
      </div>

      {/* Resumo da Sessão do Administrador */}
      <div className="p-6 rounded-xl border border-zinc-800 bg-zinc-900/30 space-y-3">
        <h3 className="text-xs font-bold text-zinc-300 uppercase tracking-wider flex items-center space-x-2">
          <Database className="w-4 h-4 text-emerald-400" />
          <span>Administrador em Execução</span>
        </h3>
        <p className="text-xs text-zinc-400">
          Autenticado como: <span className="font-semibold text-zinc-200">{user.profile.full_name}</span> ({user.email})
        </p>
        <div className="text-[11px] font-mono text-zinc-500 bg-zinc-950 p-3 rounded border border-zinc-800/80">
          STATUS: Guard server-side `requireRole(&apos;admin&apos;)` validado com sucesso.
        </div>
      </div>
    </div>
  );
}
