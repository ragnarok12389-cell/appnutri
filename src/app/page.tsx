import React from 'react';
import Link from 'next/link';
import { Shield, Users, Lock, Database, CheckCircle2 } from 'lucide-react';

export default function HomePage() {
  return (
    <div className="flex-1 flex flex-col justify-center items-center px-4 py-16 sm:px-6 lg:px-8">
      <div className="max-w-4xl w-full text-center space-y-8">
        <div className="inline-flex items-center space-x-2 bg-emerald-950/60 border border-emerald-800/60 px-4 py-1.5 rounded-full text-emerald-400 text-xs font-semibold uppercase tracking-wider">
          <Shield className="w-4 h-4" />
          <span>Fundação Técnica & Segurança de Dados</span>
        </div>

        <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-white max-w-2xl mx-auto leading-tight">
          Arquitetura Base para Plataforma SaaS de <span className="text-emerald-400">Nutrição & Treinamento</span>
        </h1>

        <p className="text-zinc-400 text-base sm:text-lg max-w-2xl mx-auto leading-relaxed">
          Ambiente multi-tenant com isolamento rigoroso via PostgreSQL Row Level Security (RLS),
          RBAC hierárquico, separação explícita de papéis e rastreabilidade total por logs de auditoria.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
          <Link
            href="/login"
            className="w-full sm:w-auto px-6 py-3 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-sm transition-all shadow-lg shadow-emerald-950"
          >
            Acessar Plataforma
          </Link>
          <Link
            href="/register"
            className="w-full sm:w-auto px-6 py-3 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-800 font-semibold text-sm transition-all"
          >
            Criar Conta de Demonstração
          </Link>
        </div>

        {/* Pilares da Arquitetura */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-12 text-left">
          <div className="p-5 rounded-xl border border-zinc-800/80 bg-zinc-900/40">
            <Lock className="w-6 h-6 text-rose-400 mb-3" />
            <h3 className="text-sm font-bold text-zinc-100 mb-1">Isolamento RLS</h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Row Level Security no PostgreSQL garante que nenhum paciente ou profissional acesse dados alheios, mesmo alterando IDs na URL.
            </p>
          </div>

          <div className="p-5 rounded-xl border border-zinc-800/80 bg-zinc-900/40">
            <Users className="w-6 h-6 text-emerald-400 mb-3" />
            <h3 className="text-sm font-bold text-zinc-100 mb-1">4 Papéis Distintos</h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Diferenciação arquitetural entre Admin, Nutricionista (clínico), Influencer (não-clínico) e Paciente.
            </p>
          </div>

          <div className="p-5 rounded-xl border border-zinc-800/80 bg-zinc-900/40">
            <Database className="w-6 h-6 text-sky-400 mb-3" />
            <h3 className="text-sm font-bold text-zinc-100 mb-1">Multi-Organização</h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Suporte estruturado a profissionais solo, clínicas com múltiplos profissionais e equipes de atendimento.
            </p>
          </div>

          <div className="p-5 rounded-xl border border-zinc-800/80 bg-zinc-900/40">
            <CheckCircle2 className="w-6 h-6 text-amber-400 mb-3" />
            <h3 className="text-sm font-bold text-zinc-100 mb-1">Auditoria & Logs</h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Registro auditável de acessos e operações críticas de usuários para conformidade e segurança.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
