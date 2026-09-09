import React from 'react';
import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth/session';
import { logoutAction } from '@/app/(auth)/actions';
import { RoleBadge } from '@/components/ui/RoleBadge';
import { Shield, UserCircle, LogOut } from 'lucide-react';

export async function Navbar() {
  const user = await getCurrentUser();

  return (
    <header className="border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-md sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center space-x-8">
          <Link href="/" className="flex items-center space-x-2 text-zinc-100 font-bold text-lg tracking-tight hover:text-emerald-400 transition-colors">
            <Shield className="w-5 h-5 text-emerald-400" />
            <span>NutriSaaS <span className="text-xs font-normal text-zinc-400 border border-zinc-800 rounded px-1.5 py-0.5 ml-1">Foundation</span></span>
          </Link>

          {user && (
            <nav className="hidden md:flex items-center space-x-4 text-sm font-medium text-zinc-400">
              <Link href="/dashboard" className="hover:text-zinc-100 transition-colors">
                Dashboard
              </Link>
              {user.profile.role_id === 'admin' && (
                <Link href="/admin" className="text-rose-400 hover:text-rose-300 transition-colors">
                  Área Admin
                </Link>
              )}
              {(user.profile.role_id === 'nutritionist' || user.profile.role_id === 'influencer') && (
                <Link href="/professional" className="text-emerald-400 hover:text-emerald-300 transition-colors">
                  Área Profissional
                </Link>
              )}
              {user.profile.role_id === 'patient' && (
                <Link href="/patient" className="text-sky-400 hover:text-sky-300 transition-colors">
                  Área do Paciente
                </Link>
              )}
            </nav>
          )}
        </div>

        <div className="flex items-center space-x-4">
          {user ? (
            <div className="flex items-center space-x-3">
              <div className="flex items-center space-x-2 text-xs text-zinc-300">
                <UserCircle className="w-4 h-4 text-zinc-500" />
                <span className="font-medium hidden sm:inline">{user.profile.full_name}</span>
                <RoleBadge role={user.profile.role_id} />
              </div>
              <form action={logoutAction}>
                <button
                  type="submit"
                  className="inline-flex items-center space-x-1 text-xs text-zinc-400 hover:text-zinc-200 border border-zinc-800 hover:border-zinc-700 bg-zinc-900 px-2.5 py-1.5 rounded-md transition-colors"
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
    </header>
  );
}
