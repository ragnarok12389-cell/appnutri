'use client';

import React, { useActionState } from 'react';
import Link from 'next/link';
import { registerAction } from '@/app/(auth)/actions';
import { User, Mail, Lock, AlertCircle, ArrowRight, ShieldCheck } from 'lucide-react';

export default function RegisterPage() {
  const [state, formAction, isPending] = useActionState(registerAction, {});

  return (
    <div className="flex-1 flex items-center justify-center px-4 py-12">
      <div className="max-w-md w-full space-y-6 bg-zinc-900/60 p-8 rounded-2xl border border-zinc-800/80 shadow-2xl backdrop-blur-xl">
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 mx-auto flex items-center justify-center">
            <User className="w-6 h-6" />
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-white">Crie sua conta</h2>
          <p className="text-xs text-zinc-400">
            Crie sua conta para acompanhamento nutricional e físico individual
          </p>
        </div>

        {state?.error && (
          <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg flex items-start space-x-2 text-rose-400 text-xs">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{state.error}</span>
          </div>
        )}

        <form action={formAction} className="space-y-4">
          <div className="space-y-1">
            <label htmlFor="register-name" className="text-xs font-semibold text-zinc-300 block">Nome completo</label>
            <div className="relative">
              <User className="w-4 h-4 text-zinc-500 absolute left-3 top-3.5" />
              <input
                type="text"
                id="register-name"
                name="fullName"
                autoComplete="name"
                required
                placeholder="Ex: Mariana Silva"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg pl-9 pr-3 py-2.5 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label htmlFor="register-email" className="text-xs font-semibold text-zinc-300 block">E-mail</label>
            <div className="relative">
              <Mail className="w-4 h-4 text-zinc-500 absolute left-3 top-3.5" />
              <input
                type="email"
                id="register-email"
                name="email"
                autoComplete="email"
                required
                placeholder="mariana@exemplo.com"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg pl-9 pr-3 py-2.5 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label htmlFor="register-password" className="text-xs font-semibold text-zinc-300 block">Senha (mínimo 8 caracteres, com letra e número)</label>
            <div className="relative">
              <Lock className="w-4 h-4 text-zinc-500 absolute left-3 top-3.5" />
              <input
                type="password"
                id="register-password"
                name="password"
                autoComplete="new-password"
                required
                placeholder="••••••••"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg pl-9 pr-3 py-2.5 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
              />
            </div>
          </div>

          <div className="p-3 rounded-lg bg-zinc-950/80 border border-zinc-800/80 flex items-start space-x-2.5 text-zinc-400 text-xs">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              Seus dados ficam protegidos e são usados para personalizar sua experiência. Profissionais entram somente por convite.
            </p>
          </div>

          <button
            type="submit"
            disabled={isPending}
            className="w-full py-2.5 px-4 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold rounded-lg text-sm flex items-center justify-center space-x-2 transition-all disabled:opacity-50 shadow-md shadow-emerald-950 mt-4"
          >
            <span>{isPending ? 'Criando conta...' : 'Criar minha conta'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        <div className="pt-4 border-t border-zinc-800/80 text-center text-xs text-zinc-400">
          Já tem conta?{' '}
          <Link href="/login" className="text-emerald-400 hover:text-emerald-300 font-semibold underline underline-offset-4">
            Faça login
          </Link>
        </div>
      </div>
    </div>
  );
}
