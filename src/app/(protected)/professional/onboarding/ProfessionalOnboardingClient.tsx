'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  submitNutritionistOnboardingAction,
  submitInfluencerOnboardingAction,
} from '@/app/actions/onboarding';
import { ProfessionalProfile } from '@/types/database';
import { AlertCircle, CheckCircle2, Loader2, Save } from 'lucide-react';

interface Props {
  roleId: 'nutritionist' | 'influencer';
  initialProfile: ProfessionalProfile | null;
}

export default function ProfessionalOnboardingClient({ roleId, initialProfile }: Props) {
  const router = useRouter();
  const isNutri = roleId === 'nutritionist';

  // Nutritionist state
  const [licenseNumber, setLicenseNumber] = useState(initialProfile?.license_number || '');
  const [licenseState, setLicenseState] = useState(initialProfile?.license_state || 'SP');
  const [specialtiesText, setSpecialtiesText] = useState(
    initialProfile?.specialties?.join(', ') || 'Clínica, Esportiva'
  );

  // Influencer state
  const [niche, setNiche] = useState(initialProfile?.niche || '');
  const [instagram, setInstagram] = useState(
    (initialProfile?.social_links as Record<string, string>)?.instagram || ''
  );

  // Common state
  const [bio, setBio] = useState(initialProfile?.bio || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    if (isNutri) {
      const specialties = specialtiesText
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      const res = await submitNutritionistOnboardingAction({
        license_number: licenseNumber,
        license_state: licenseState,
        bio: bio || null,
        specialties,
      });

      setLoading(false);
      if (res.error) {
        setError(res.error);
      } else {
        setSuccess(true);
        setTimeout(() => router.push('/professional/patients'), 1500);
      }
    } else {
      const res = await submitInfluencerOnboardingAction({
        niche,
        bio: bio || null,
        social_links: instagram ? { instagram } : {},
      });

      setLoading(false);
      if (res.error) {
        setError(res.error);
      } else {
        setSuccess(true);
        setTimeout(() => router.push('/professional/patients'), 1500);
      }
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
          <span>Perfil atualizado com sucesso! Redirecionando para seus pacientes...</span>
        </div>
      )}

      {isNutri ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2 space-y-1.5">
              <label htmlFor="crn-number" className="text-xs font-semibold text-zinc-300">
                Número de Registro CRN
              </label>
              <input
                id="crn-number"
                type="text"
                required
                value={licenseNumber}
                onChange={(e) => setLicenseNumber(e.target.value)}
                placeholder="Ex: 12345/P"
                className="w-full px-3 py-2 text-sm bg-zinc-950 border border-zinc-800 rounded-lg text-white placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="crn-state" className="text-xs font-semibold text-zinc-300">
                UF do Conselho
              </label>
              <select
                id="crn-state"
                value={licenseState}
                onChange={(e) => setLicenseState(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-zinc-950 border border-zinc-800 rounded-lg text-white focus:outline-none focus:border-emerald-500 uppercase"
              >
                {['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'].map((uf) => (
                  <option key={uf} value={uf}>
                    {uf}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="nutri-specialties" className="text-xs font-semibold text-zinc-300">
              Especialidades (separadas por vírgula)
            </label>
            <input
              id="nutri-specialties"
              type="text"
              required
              value={specialtiesText}
              onChange={(e) => setSpecialtiesText(e.target.value)}
              placeholder="Ex: Nutrição Esportiva, Emagrecimento, Vegetariana"
              className="w-full px-3 py-2 text-sm bg-zinc-950 border border-zinc-800 rounded-lg text-white placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500"
            />
          </div>
        </>
      ) : (
        <>
          <div className="space-y-1.5">
            <label htmlFor="influencer-niche" className="text-xs font-semibold text-zinc-300">
              Área de Atuação / Nicho
            </label>
            <input
              id="influencer-niche"
              type="text"
              required
              value={niche}
              onChange={(e) => setNiche(e.target.value)}
              placeholder="Ex: Treino em Casa, Lifestyle Saudável, Corrida de Rua"
              className="w-full px-3 py-2 text-sm bg-zinc-950 border border-zinc-800 rounded-lg text-white placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="influencer-instagram" className="text-xs font-semibold text-zinc-300">
              Instagram / Rede Social Principal
            </label>
            <input
              id="influencer-instagram"
              type="text"
              value={instagram}
              onChange={(e) => setInstagram(e.target.value)}
              placeholder="Ex: @seuperfil"
              className="w-full px-3 py-2 text-sm bg-zinc-950 border border-zinc-800 rounded-lg text-white placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500"
            />
          </div>
        </>
      )}

      <div className="space-y-1.5">
        <label htmlFor="bio" className="text-xs font-semibold text-zinc-300">
          Mini-Biografia Profissional (Opcional)
        </label>
        <textarea
          id="bio"
          rows={3}
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          placeholder="Apresentação para seus pacientes..."
          className="w-full px-3 py-2 text-sm bg-zinc-950 border border-zinc-800 rounded-lg text-white placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500 resize-none"
        />
      </div>

      <div className="pt-2">
        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-colors flex items-center justify-center space-x-2 disabled:opacity-50"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Salvando Perfil...</span>
            </>
          ) : (
            <>
              <Save className="w-4 h-4" />
              <span>Salvar e Concluir Onboarding</span>
            </>
          )}
        </button>
      </div>
    </form>
  );
}
