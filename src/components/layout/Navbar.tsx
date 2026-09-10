import React from 'react';
import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth/session';
import { logoutAction } from '@/app/(auth)/actions';
import { RoleBadge } from '@/components/ui/RoleBadge';
import { Activity, Apple, Bot, Dumbbell, Gauge, LogOut, TrendingUp, UserCircle, Users } from 'lucide-react';

export async function Navbar() {
  const user = await getCurrentUser();
  const roleHome = user?.profile.role_id === 'patient'
    ? '/patient'
    : user?.profile.role_id === 'admin'
      ? '/admin'
      : '/professional';

  const roleLinks = user?.profile.role_id === 'patient'
    ? [
        { href: '/patient', label: 'Início', icon: Gauge },
        { href: '/patient/nutrition/plan', label: 'Dieta', icon: Apple },
        { href: '/patient/workout', label: 'Treino', icon: Dumbbell },
        { href: '/patient/progress', label: 'Progresso', icon: TrendingUp },
        { href: '/patient/assistant', label: 'IA', icon: Bot },
      ]
    : user?.profile.role_id === 'admin'
      ? [
          { href: '/admin', label: 'Visão geral', icon: Gauge },
          { href: '/admin/professionals', label: 'Profissionais', icon: Users },
          { href: '/admin/products', label: 'Produtos', icon: Activity },
        ]
      : [
          { href: '/professional', label: 'Início', icon: Gauge },
          { href: '/professional/patients', label: 'Pacientes', icon: Users },
          { href: '/professional/foods', label: 'Alimentos', icon: Apple },
        ];

  return (
    <header className="border-b border-white/10 bg-zinc-950/80 backdrop-blur-xl sticky top-0 z-50 shadow-[0_1px_30px_rgba(0,0,0,0.18)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        <div className="flex items-center gap-7 min-w-0">
          <Link href={user ? roleHome : '/'} className="flex items-center gap-2.5 text-white font-black text-lg tracking-tight hover:text-emerald-300 transition-colors shrink-0">
            <span className="grid place-items-center w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-600 text-zinc-950 shadow-lg shadow-emerald-950/50">
              <Activity className="w-4.5 h-4.5" />
            </span>
            <span>App<span className="text-emerald-400">Nutri</span></span>
          </Link>

          {user && (
            <nav aria-label="Navegação principal" className="hidden lg:flex items-center gap-1 text-sm font-semibold text-zinc-400">
              {roleLinks.map(({ href, label, icon: Icon }) => (
                <Link key={href} href={href} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 hover:bg-white/5 hover:text-white transition-colors">
                  <Icon className="w-3.5 h-3.5" />
                  {label}
                </Link>
              ))}
            </nav>
          )}
        </div>

        <div className="flex items-center space-x-4">
          {user ? (
            <div className="flex items-center space-x-3">
              <div className="flex items-center space-x-2 text-xs text-zinc-300 min-w-0">
                <UserCircle className="w-4 h-4 text-zinc-500" />
                <span className="font-medium hidden sm:inline">{user.profile.full_name}</span>
                <RoleBadge role={user.profile.role_id} />
              </div>
              <form action={logoutAction}>
                <button
                  type="submit"
                  className="inline-flex items-center space-x-1 text-xs text-zinc-400 hover:text-white border border-zinc-800 hover:border-zinc-700 bg-zinc-900/80 px-2.5 py-1.5 rounded-lg transition-colors"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Sair</span>
                </button>
              </form>
            </div>
          ) : (
            <div className="flex items-center space-x-3 text-sm">
              <Link
                href="/login"
                className="text-zinc-300 hover:text-white px-3 py-1.5 rounded-md hover:bg-zinc-900 transition-colors"
              >
                Entrar
              </Link>
              <Link
                href="/register"
                className="bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold px-3.5 py-1.5 rounded-md text-xs transition-colors"
              >
                Criar Conta
              </Link>
            </div>
          )}
        </div>
      </div>
      {user && (
        <nav aria-label="Navegação rápida" className="lg:hidden max-w-7xl mx-auto px-3 pb-2 flex items-center gap-1 overflow-x-auto [scrollbar-width:none]">
          {roleLinks.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} className="min-w-fit flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-zinc-400 hover:bg-white/5 hover:text-white transition-colors">
              <Icon className="w-3.5 h-3.5" />
              {label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}
