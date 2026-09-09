import React from 'react';
import Link from 'next/link';
import { requireRole } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import {
  HeartPulse,
  Stethoscope,
  Sparkles,
  Building,
  CheckCircle2,
  Clock,
  Apple,
  Dumbbell,
  TrendingUp,
  Activity,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react';

export default async function PatientDashboardPage() {
  const user = await requireRole('patient');
  const supabase = await createClient();

  // 1. Busca o profissional responsável vinculado
  const { data: link } = await supabase
    .from('professional_patient_links')
    .select(`
      id,
      professional_id,
      status,
      is_primary,
      link_type,
      professional_profiles (
        id,
        professional_type,
        license_number,
        license_state,
        niche,
        profiles (
          full_name,
          email
        )
      ),
      organizations (
        name
      )
    `)
    .eq('patient_id', user.id)
    .eq('status', 'active')
    .order('is_primary', { ascending: false })
    .limit(1)
    .maybeSingle();

  // 2. Busca status de onboarding inicial
  const { data: onboarding } = await supabase
    .from('patient_onboarding')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();

  // 3. Busca status do perfil nutricional completo
  const { data: nutritionProfile } = await supabase
    .from('patient_nutrition_profiles')
    .select('completion_percentage, is_completed, version')
    .eq('id', user.id)
    .maybeSingle();

  // 4. Busca status do cálculo do motor nutricional (Etapa 4)
  const { data: latestEngineRun } = await supabase
    .from('nutrition_engine_runs')
    .select(`
      id,
      status,
      requires_professional_review,
      engine_version,
      nutrition_targets (
        target_calories_nominal_kcal,
        target_calories_min_kcal,
        target_calories_max_kcal,
        protein_g,
        carbohydrate_g,
        fat_g
      )
    `)
    .eq('patient_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const prof = link?.professional_profiles as unknown as {
    professional_type: string;
    license_number: string | null;
    license_state: string | null;
    niche: string | null;
    profiles: { full_name: string; email: string } | null;
  } | null;

  const org = link?.organizations as unknown as { name: string } | null;
  const isNutri = prof?.professional_type === 'nutritionist';

  return (
    <div className="flex-1 max-w-5xl w-full mx-auto px-4 py-10 sm:px-6 lg:px-8 space-y-8">
      {/* Header */}
      <div className="border-b border-zinc-800 pb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="inline-flex items-center space-x-1.5 text-xs font-bold text-sky-400 uppercase tracking-widest bg-sky-500/10 px-2.5 py-1 rounded-md border border-sky-500/20">
            <HeartPulse className="w-3.5 h-3.5" />
            <span>Área do Paciente</span>
          </div>
          <h1 className="text-3xl font-extrabold text-white mt-2">
            Olá, {user.profile.full_name}
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Seu portal individual de acompanhamento físico e nutricional.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <span className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-semibold">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Conta Ativa</span>
          </span>
        </div>
      </div>

      {/* Grid: Profissional Responsável & Status de Onboarding */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Card do Profissional Responsável */}
        <div className="p-6 rounded-2xl border border-zinc-800 bg-zinc-900/40 space-y-4">
          <div className="flex items-center space-x-2 text-xs font-bold uppercase tracking-wider text-zinc-400">
            {isNutri ? (
              <Stethoscope className="w-4 h-4 text-emerald-400" />
            ) : (
              <Sparkles className="w-4 h-4 text-purple-400" />
            )}
            <span>Profissional Responsável</span>
          </div>

          {prof ? (
            <div className="space-y-3">
              <div>
                <div className="text-lg font-bold text-white">
                  {prof.profiles?.full_name || 'Profissional Designado'}
                </div>
                <div className="text-xs text-zinc-400">
                  {isNutri ? 'Nutricionista Credenciado' : 'Influenciador / Criador Parceiro'}
                </div>
              </div>

              <div className="text-xs text-zinc-400 space-y-1">
                {isNutri && prof.license_number && (
                  <div>
                    <span className="text-zinc-500">Registro:</span>{' '}
                    <strong className="text-zinc-200">
                      {prof.license_number} ({prof.license_state || 'BR'})
                    </strong>
                  </div>
                )}

                {!isNutri && prof.niche && (
                  <div>
                    <span className="text-zinc-500">Área:</span>{' '}
                    <strong className="text-zinc-200">{prof.niche}</strong>
                  </div>
                )}

                {org && (
                  <div className="flex items-center space-x-1.5 pt-1">
                    <Building className="w-3.5 h-3.5 text-zinc-500" />
                    <span>{org.name}</span>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="text-xs text-zinc-500 py-3">
              Nenhum profissional vinculado diretamente. Entre em contato com seu profissional caso tenha recebido um convite.
            </div>
          )}
        </div>

        {/* Card do Progresso do Onboarding */}
        <div className="p-6 rounded-2xl border border-zinc-800 bg-zinc-900/40 space-y-4">
          <div className="flex items-center space-x-2 text-xs font-bold uppercase tracking-wider text-zinc-400">
            <Clock className="w-4 h-4 text-amber-400" />
            <span>Progresso do Onboarding</span>
          </div>

          {onboarding?.is_completed ? (
            <div className="space-y-3">
              <div className="flex items-center space-x-2 text-emerald-400">
                <CheckCircle2 className="w-5 h-5" />
                <span className="text-sm font-bold">Onboarding Concluído</span>
              </div>
              <p className="text-xs text-zinc-400">
                Seus dados cadastrais e objetivo principal já estão disponíveis para consulta pelo seu profissional.
              </p>
              <div className="pt-1">
                <Link
                  href="/patient/onboarding"
                  className="text-xs text-zinc-400 hover:text-white underline underline-offset-4"
                >
                  Atualizar respostas do questionário
                </Link>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="text-amber-400 text-sm font-semibold">
                Questionário Inicial Pendente
              </div>
              <p className="text-xs text-zinc-400">
                Responda às perguntas iniciais sobre seu peso, altura e metas para liberar a melhor experiência de acompanhamento.
              </p>
              <div className="pt-2">
                <Link
                  href="/patient/onboarding"
                  className="inline-flex items-center space-x-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg transition-colors"
                >
                  <span>Iniciar Questionário</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Banner / Card de Perfil Nutricional Completo (Etapa 3) */}
      <div className="p-6 rounded-2xl border border-emerald-500/30 bg-gradient-to-r from-emerald-950/20 via-zinc-900/60 to-zinc-900/40 relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-5">
          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                Perfil Nutricional Completo
              </span>
              {nutritionProfile?.is_completed && (
                <span className="text-[11px] text-zinc-400 font-mono">
                  Versão {nutritionProfile.version}
                </span>
              )}
            </div>
            <h2 className="text-xl font-bold text-white">
              {nutritionProfile?.is_completed
                ? 'Perfil Nutricional Preenchido'
                : 'Complete seu perfil para receber seu plano personalizado'}
            </h2>
            <p className="text-xs text-zinc-400 max-w-xl">
              {nutritionProfile?.is_completed
                ? 'Suas preferências, rotina, restrições e orçamento alimentar estão registrados e prontos para embasar sua futura prescrição dietética.'
                : 'Responda ao questionário completo de 8 etapas para informar seus hábitos, alimentos favoritos, aversões e orçamento alimentar.'}
            </p>

            {/* Barra de Progresso */}
            <div className="flex items-center space-x-3 pt-2">
              <div className="w-48 bg-zinc-800 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-emerald-500 h-full transition-all duration-500"
                  style={{ width: `${nutritionProfile?.completion_percentage || 0}%` }}
                />
              </div>
              <span className="text-xs font-bold text-emerald-400">
                {nutritionProfile?.completion_percentage || 0}% completo
              </span>
            </div>
          </div>

          <div className="shrink-0">
            <Link
              href="/patient/nutrition-profile"
              className="inline-flex items-center space-x-2 px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-bold text-xs rounded-xl transition-colors shadow-lg shadow-emerald-500/10"
            >
              <span>{nutritionProfile?.is_completed ? 'Revisar / Atualizar Perfil' : 'Preencher Perfil Nutricional'}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </div>

      {/* Card do Motor Nutricional Determinístico (Etapa 4) */}
      <div className="p-6 rounded-2xl border border-zinc-800 bg-zinc-900/40 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2 text-xs font-bold uppercase tracking-wider text-zinc-400">
            <Sparkles className="w-4 h-4 text-sky-400" />
            <span>Parâmetros do Motor Nutricional</span>
          </div>
          {latestEngineRun && (
            <span className="text-[10px] bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded font-mono">
              {latestEngineRun.engine_version}
            </span>
          )}
        </div>

        {latestEngineRun ? (
          <div className="space-y-3">
            {latestEngineRun.status === 'calculated' && latestEngineRun.nutrition_targets?.[0] ? (
              <div className="space-y-2">
                <div className="flex items-center space-x-2 text-emerald-400">
                  <CheckCircle2 className="w-4 h-4" />
                  <span className="text-sm font-bold">Metas Nutricionais Calculadas com Sucesso</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
                  <div className="p-3 bg-zinc-950/60 rounded-xl border border-zinc-800/80">
                    <div className="text-[11px] text-zinc-400">Meta Calórica</div>
                    <div className="text-sm font-bold text-white">
                      {latestEngineRun.nutrition_targets[0].target_calories_nominal_kcal} kcal/dia
                    </div>
                  </div>
                  <div className="p-3 bg-zinc-950/60 rounded-xl border border-zinc-800/80">
                    <div className="text-[11px] text-zinc-400">Proteínas</div>
                    <div className="text-sm font-bold text-emerald-400">
                      {latestEngineRun.nutrition_targets[0].protein_g} g
                    </div>
                  </div>
                  <div className="p-3 bg-zinc-950/60 rounded-xl border border-zinc-800/80">
                    <div className="text-[11px] text-zinc-400">Carboidratos</div>
                    <div className="text-sm font-bold text-amber-400">
                      {latestEngineRun.nutrition_targets[0].carbohydrate_g} g
                    </div>
                  </div>
                  <div className="p-3 bg-zinc-950/60 rounded-xl border border-zinc-800/80">
                    <div className="text-[11px] text-zinc-400">Gorduras</div>
                    <div className="text-sm font-bold text-sky-400">
                      {latestEngineRun.nutrition_targets[0].fat_g} g
                    </div>
                  </div>
                </div>
              </div>
            ) : latestEngineRun.status === 'review_required' ? (
              <div className="p-3.5 bg-amber-500/10 border border-amber-500/20 rounded-xl space-y-1">
                <div className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
                  <Clock className="w-4 h-4" />
                  <span>Em Análise: Revisão por Profissional de Saúde Necessária</span>
                </div>
                <p className="text-xs text-zinc-300">
                  Seus dados indicam condições específicas que exigem validação e aprovação do nutricionista responsável antes da liberação do plano alimentar.
                </p>
              </div>
            ) : (
              <div className="text-xs text-zinc-400">
                Status do motor: <span className="font-semibold text-white capitalize">{latestEngineRun.status}</span>. Aguarde atualização pelo seu profissional.
              </div>
            )}
          </div>
        ) : (
          <div className="text-xs text-zinc-500 py-2">
            O motor nutricional será acionado automaticamente assim que o seu questionário de 8 etapas for concluído e validado.
          </div>
        )}
      </div>

      {/* Seção de Funcionalidades Futuras (Placeholders Claramente Indisponíveis / Em Breve) */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-white">Módulos de Acompanhamento</h2>
          <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">
            Etapas Futuras do Produto
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Minha Dieta */}
          <div className="p-5 rounded-2xl border border-zinc-800/80 bg-zinc-950/40 relative overflow-hidden space-y-3">
            <div className="flex items-center justify-between">
              <div className="p-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-500">
                <Apple className="w-5 h-5" />
              </div>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-zinc-900 border border-zinc-800 text-zinc-400">
                Em breve
              </span>
            </div>
            <div>
              <h3 className="text-sm font-bold text-zinc-300">Minha Dieta</h3>
              <p className="text-[11px] text-zinc-500 mt-1 leading-relaxed">
                Plano alimentar individualizado com controle de refeições e macros (Etapa 3).
              </p>
            </div>
          </div>

          {/* Meu Treino */}
          <div className="p-5 rounded-2xl border border-zinc-800/80 bg-zinc-950/40 relative overflow-hidden space-y-3">
            <div className="flex items-center justify-between">
              <div className="p-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-500">
                <Dumbbell className="w-5 h-5" />
              </div>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-zinc-900 border border-zinc-800 text-zinc-400">
                Em breve
              </span>
            </div>
            <div>
              <h3 className="text-sm font-bold text-zinc-300">Meu Treino</h3>
              <p className="text-[11px] text-zinc-500 mt-1 leading-relaxed">
                Fichas de treinamento e divisão de exercícios prescritas pelo profissional.
              </p>
            </div>
          </div>

          {/* Acompanhamento */}
          <div className="p-5 rounded-2xl border border-zinc-800/80 bg-zinc-950/40 relative overflow-hidden space-y-3">
            <div className="flex items-center justify-between">
              <div className="p-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-500">
                <Activity className="w-5 h-5" />
              </div>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-zinc-900 border border-zinc-800 text-zinc-400">
                Em breve
              </span>
            </div>
            <div>
              <h3 className="text-sm font-bold text-zinc-300">Acompanhamento</h3>
              <p className="text-[11px] text-zinc-500 mt-1 leading-relaxed">
                Check-ins periódicos e registros de adesão para validação contínua.
              </p>
            </div>
          </div>

          {/* Evolução */}
          <div className="p-5 rounded-2xl border border-zinc-800/80 bg-zinc-950/40 relative overflow-hidden space-y-3">
            <div className="flex items-center justify-between">
              <div className="p-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-500">
                <TrendingUp className="w-5 h-5" />
              </div>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-zinc-900 border border-zinc-800 text-zinc-400">
                Em breve
              </span>
            </div>
            <div>
              <h3 className="text-sm font-bold text-zinc-300">Evolução Corporal</h3>
              <p className="text-[11px] text-zinc-500 mt-1 leading-relaxed">
                Gráficos de peso, medidas corporais e histórico comparativo.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
