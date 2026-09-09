'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { acceptProfessionalInviteAction } from '@/app/actions/invites';
import { User, Lock, Mail, AlertCircle, Loader2 } from 'lucide-react';

interface Props {
  token: string;
  defaultEmail: string;
}

export default function ProfessionalInviteForm({ token, defaultEmail }: Props) {
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError('A senha deve ter no mínimo 8 caracteres.');
      return;
    }

    if (password !== confirmPassword) {
      setError('As senhas não coincidem.');
      return;
    }

    setLoading(true);

    const formData = new FormData();
    formData.append('token', token);
    formData.append('email', defaultEmail);
    formData.append('full_name', fullName);
    formData.append('password', password);

    const res = await acceptProfessionalInviteAction(formData);

    if (res.error) {
      setError(res.error);
      setLoading(false);
    } else {
      router.push('/professional/onboarding');
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="p-3.5 rounded-xl bg-rose-950/50 border border-rose-800/60 text-rose-300 text-xs flex items-start space-x-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <div className="space-y-1">
        <label className="text-xs font-semibold text-zinc-300">Email Cadastrado</label>
        <div className="relative">
          <Mail className="w-4 h-4 text-zinc-500 absolute left-3 top-3" />
          <input
            type="email"
            readOnly
            disabled
            value={defaultEmail}
            className="w-full pl-9 pr-3 py-2 text-xs font-mono bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-400 cursor-not-allowed"
          />
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-xs font-semibold text-zinc-300">Nome Completo</label>
        <div className="relative">
          <User className="w-4 h-4 text-zinc-500 absolute left-3 top-3" />
          <input
            type="text"
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Dr. João Silva"
            className="w-full pl-9 pr-3 py-2 text-sm bg-zinc-950 border border-zinc-800 rounded-lg text-white placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500"
          />
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-xs font-semibold text-zinc-300">Criar Senha de Acesso</label>
        <div className="relative">
          <Lock className="w-4 h-4 text-zinc-500 absolute left-3 top-3" />
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Mínimo 8 caracteres"
            className="w-full pl-9 pr-3 py-2 text-sm bg-zinc-950 border border-zinc-800 rounded-lg text-white placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500"
          />
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-xs font-semibold text-zinc-300">Confirmar Senha</label>
        <div className="relative">
          <Lock className="w-4 h-4 text-zinc-500 absolute left-3 top-3" />
          <input
            type="password"
            required
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Repita a senha"
            className="w-full pl-9 pr-3 py-2 text-sm bg-zinc-950 border border-zinc-800 rounded-lg text-white placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500"
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full py-2.5 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-colors flex items-center justify-center space-x-2 disabled:opacity-50 mt-2"
      >
        {loading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Configurando Perfil...</span>
          </>
        ) : (
          <span>Ativar Conta Profissional</span>
        )}
      </button>
    </form>
  );
}
