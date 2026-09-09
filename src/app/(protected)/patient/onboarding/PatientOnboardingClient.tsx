'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { submitPatientOnboardingAction } from '@/app/actions/onboarding';
import { PatientOnboarding, PatientGoal } from '@/types/database';
import { AlertCircle, CheckCircle2, Loader2, ArrowRight } from 'lucide-react';

interface Props {
  initialData: PatientOnboarding | null;
  defaultFirstName: string;
  defaultLastName: string;
}

export default function PatientOnboardingClient({
  initialData,
  defaultFirstName,
  defaultLastName,
}: Props) {
  const router = useRouter();

  const [firstName, setFirstName] = useState(initialData?.first_name || defaultFirstName);
  const [lastName, setLastName] = useState(initialData?.last_name || defaultLastName);
  const [birthDate, setBirthDate] = useState(initialData?.birth_date || '');
  const [gender, setGender] = useState(initialData?.gender || 'prefer_not_to_say');
  const [heightCm, setHeightCm] = useState(initialData?.height_cm ? String(initialData.height_cm) : '');
  const [weightKg, setWeightKg] = useState(initialData?.weight_kg ? String(initialData.weight_kg) : '');
  const [city, setCity] = useState(initialData?.city || '');
  const [primaryGoal, setPrimaryGoal] = useState<PatientGoal>(
    initialData?.primary_goal || 'improve_health'
  );

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const res = await submitPatientOnboardingAction({
      first_name: firstName,
      last_name: lastName,
      birth_date: birthDate || null,
      gender: gender as 'male' | 'female' | 'other' | 'prefer_not_to_say',
      height_cm: heightCm ? parseFloat(heightCm) : null,
      weight_kg: weightKg ? parseFloat(weightKg) : null,
      country: 'BR',
      city: city || null,
      timezone: 'America/Sao_Paulo',
      primary_goal: primaryGoal,
    });

    setLoading(false);

    if (res.error) {
      setError(res.error);
    } else {
      setSuccess(true);
      setTimeout(() => router.push('/patient'), 1200);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="p-6 rounded-2xl border border-zinc-800 bg-zinc-900/40 space-y-6">
      {error && (
        <div className="p-3.5 rounded-xl bg-rose-950/50 border border-rose-800/60 text-rose-300 text-xs flex items-start space-x-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="p-3.5 rounded-xl bg-emerald-950/50 border border-emerald-800/60 text-emerald-300 text-xs flex items-start space-x-2">
          <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
          <span>Informações salvas com sucesso! Redirecionando para seu painel...</span>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label htmlFor="first-name" className="text-xs font-semibold text-zinc-300">
            Primeiro Nome
          </label>
          <input
            id="first-name"
            type="text"
            required
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            className="w-full px-3 py-2 text-sm bg-zinc-950 border border-zinc-800 rounded-lg text-white placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="last-name" className="text-xs font-semibold text-zinc-300">
            Sobrenome
          </label>
          <input
            id="last-name"
            type="text"
            required
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            className="w-full px-3 py-2 text-sm bg-zinc-950 border border-zinc-800 rounded-lg text-white placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label htmlFor="birth-date" className="text-xs font-semibold text-zinc-300">
            Data de Nascimento
          </label>
          <input
            id="birth-date"
            type="date"
            value={birthDate}
            onChange={(e) => setBirthDate(e.target.value)}
            className="w-full px-3 py-2 text-sm bg-zinc-950 border border-zinc-800 rounded-lg text-white focus:outline-none focus:border-emerald-500"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="gender-select" className="text-xs font-semibold text-zinc-300">
            Gênero
          </label>
          <select
            id="gender-select"
            value={gender}
            onChange={(e) => setGender(e.target.value as 'male' | 'female' | 'other' | 'prefer_not_to_say')}
            className="w-full px-3 py-2 text-sm bg-zinc-950 border border-zinc-800 rounded-lg text-white focus:outline-none focus:border-emerald-500"
          >
            <option value="male">Masculino</option>
            <option value="female">Feminino</option>
            <option value="other">Outro</option>
            <option value="prefer_not_to_say">Prefiro não informar</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="space-y-1.5">
          <label htmlFor="height-cm" className="text-xs font-semibold text-zinc-300">
            Altura (cm)
          </label>
          <input
            id="height-cm"
            type="number"
            step="0.1"
            min="50"
            max="250"
            value={heightCm}
            onChange={(e) => setHeightCm(e.target.value)}
            placeholder="Ex: 175"
            className="w-full px-3 py-2 text-sm bg-zinc-950 border border-zinc-800 rounded-lg text-white placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="weight-kg" className="text-xs font-semibold text-zinc-300">
            Peso Atual (kg)
          </label>
          <input
            id="weight-kg"
            type="number"
            step="0.1"
            min="20"
            max="400"
            value={weightKg}
            onChange={(e) => setWeightKg(e.target.value)}
            placeholder="Ex: 72.5"
            className="w-full px-3 py-2 text-sm bg-zinc-950 border border-zinc-800 rounded-lg text-white placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="city-input" className="text-xs font-semibold text-zinc-300">
            Cidade
          </label>
          <input
            id="city-input"
            type="text"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="Ex: São Paulo"
            className="w-full px-3 py-2 text-sm bg-zinc-950 border border-zinc-800 rounded-lg text-white placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="primary-goal-select" className="text-xs font-semibold text-zinc-300">
          Qual seu objetivo principal?
        </label>
        <select
          id="primary-goal-select"
          value={primaryGoal}
          onChange={(e) => setPrimaryGoal(e.target.value as PatientGoal)}
          className="w-full px-3 py-2.5 text-sm bg-zinc-950 border border-zinc-800 rounded-lg text-white focus:outline-none focus:border-emerald-500 font-medium"
        >
          <option value="lose_weight">Perder peso / Emagrecimento saudável</option>
          <option value="gain_muscle">Ganho de massa muscular (Hipertrofia)</option>
          <option value="maintain_weight">Manter peso e hábitos saudáveis</option>
          <option value="improve_health">Melhorar marcadores de saúde e disposição</option>
          <option value="improve_performance">Performance esportiva e condicionamento</option>
        </select>
      </div>

      <div className="pt-2">
        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-colors flex items-center justify-center space-x-2 disabled:opacity-50"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Salvando Questionário...</span>
            </>
          ) : (
            <>
              <span>Concluir Onboarding e Acessar Painel</span>
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </div>
    </form>
  );
}
