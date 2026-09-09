import React from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import {
  User,
  ArrowLeft,
  Mail,
  Calendar,
  Target,
  Scale,
  Ruler,
  MapPin,
  ShieldCheck,
  Clock,
  Apple,
  AlertTriangle,
  Activity,
} from 'lucide-react';
import { getNutritionProfileForPatientAction } from '@/app/actions/nutrition-profile';
import { getLatestNutritionTargetAction } from '@/app/actions/nutrition-engine';
import { hasPermission } from '@/lib/auth/roles';

interface Props {
  params: Promise<{ patientId: string }>;
}

const GOAL_LABELS: Record<string, string> = {
  lose_weight: 'Emagrecimento',
  gain_muscle: 'Hipertrofia Muscular',
  maintain_weight: 'Manutenção de Peso',
  improve_health: 'Melhora da Saúde',
  improve_performance: 'Performance Esportiva',
};

const GENDER_LABELS: Record<string, string> = {
  male: 'Masculino',
  female: 'Feminino',
  other: 'Outro',
  prefer_not_to_say: 'Prefere não informar',
};

export default async function PatientDetailsPage({ params }: Props) {
  const { patientId } = await params;
  const user = await requireRole(['nutritionist', 'influencer', 'admin']);
  const supabase = await createClient();

  // 1. Busca perfil do paciente protegido por RLS (can_access_patient)
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, full_name, email, created_at, is_active')
    .eq('id', patientId)
    .single();

  // Se o RLS bloqueou ou o paciente não existe, zero dados são retornados
  if (profileError || !profile) {
    notFound();
  }

  // 2. Busca o vínculo específico
  const { data: link } = await supabase
    .from('professional_patient_links')
    .select('status, is_primary, link_type, created_at')
    .eq('patient_id', patientId)
    .eq('professional_id', user.id)
    .single();

  // 3. Busca dados de onboarding do paciente protegido por RLS
  const { data: onboarding } = await supabase
    .from('patient_onboarding')
    .select('*')
    .eq('id', patientId)
    .maybeSingle();

  // 4. Busca perfil nutricional completo (com segregação de dados sensíveis)
  const profileRes = await getNutritionProfileForPatientAction(patientId);
  const nutritionProfile = profileRes.data || null;
  const canViewSensitive = hasPermission(user, 'nutrition_sensitive.view');

  // 5. Busca parâmetros do motor nutricional (com segregação de razão clínica)
  const engineRes = await getLatestNutritionTargetAction(patientId);
  const engineData = engineRes.data || null;

  return (
    <div className="flex-1 max-w-4xl w-full mx-auto px-4 py-10 sm:px-6 lg:px-8 space-y-8">
      {/* Header com Navegação */}
      <div className="border-b border-zinc-800 pb-6 flex items-start justify-between">
        <div>
          <div className="inline-flex items-center space-x-1.5 text-xs font-bold text-emerald-400 uppercase tracking-widest bg-emerald-500/10 px-2.5 py-1 rounded-md border border-emerald-500/20">
            <User className="w-3.5 h-3.5" />
            <span>Ficha Básica do Paciente</span>
          </div>
          <h1 className="text-3xl font-extrabold text-white mt-2">{profile.full_name}</h1>
          <p className="text-xs text-zinc-400 mt-1">
            Vínculo autorizado pelo sistema e validado via Row Level Security (<code className="text-zinc-300">private.can_access_patient</code>).
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          {(user.profile.role_id === 'nutritionist' || user.profile.role_id === 'admin') && <Link href={`/professional/patients/${patientId}/progress`} className="inline-flex items-center space-x-1.5 text-xs text-emerald-400 hover:text-emerald-300 border border-emerald-500/20 bg-emerald-500/10 px-3 py-1.5 rounded-lg transition-colors"><Activity className="w-3.5 h-3.5" /><span>Ver progresso</span></Link>}
          <Link
            href="/professional/patients"
            className="inline-flex items-center space-x-1.5 text-xs text-zinc-400 hover:text-zinc-200 border border-zinc-800 bg-zinc-900 px-3 py-1.5 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Voltar para Pacientes</span>
          </Link>
        </div>
      </div>

      {/* Grid de Informações Básicas */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Identificação Cadastral */}
        <div className="p-5 rounded-xl border border-zinc-800 bg-zinc-900/40 space-y-3">
          <div className="flex items-center space-x-2 text-xs font-bold uppercase text-zinc-400">
            <Mail className="w-4 h-4 text-emerald-400" />
            <span>Contato</span>
          </div>
          <div className="text-sm font-semibold text-white break-all">{profile.email}</div>
          <div className="text-xs text-zinc-400 flex items-center space-x-1">
            <Calendar className="w-3.5 h-3.5 text-zinc-500" />
            <span>Cadastrado em {new Date(profile.created_at).toLocaleDateString('pt-BR')}</span>
          </div>
        </div>

        {/* Vínculo Profissional */}
        <div className="p-5 rounded-xl border border-zinc-800 bg-zinc-900/40 space-y-3">
          <div className="flex items-center space-x-2 text-xs font-bold uppercase text-zinc-400">
            <ShieldCheck className="w-4 h-4 text-sky-400" />
            <span>Status do Vínculo</span>
          </div>
          <div className="flex items-center space-x-2">
            <span className="inline-block px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-bold uppercase">
              {link?.status || 'Ativo'}
            </span>
            {link?.is_primary && (
              <span className="inline-block px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 text-xs font-medium">
                Profissional Titular
              </span>
            )}
          </div>
          <div className="text-xs text-zinc-500">
            Tipo de Vínculo: <strong className="text-zinc-300 capitalize">{link?.link_type || 'Direto'}</strong>
          </div>
        </div>

        {/* Status de Onboarding */}
        <div className="p-5 rounded-xl border border-zinc-800 bg-zinc-900/40 space-y-3">
          <div className="flex items-center space-x-2 text-xs font-bold uppercase text-zinc-400">
            <Clock className="w-4 h-4 text-amber-400" />
            <span>Onboarding Inicial</span>
          </div>
          <div>
            {onboarding?.is_completed ? (
              <span className="text-emerald-400 text-sm font-semibold flex items-center space-x-1">
                <span>Formulário Concluído</span>
              </span>
            ) : (
              <span className="text-amber-400 text-sm font-semibold">Pendente de Resposta</span>
            )}
          </div>
          <p className="text-xs text-zinc-500">
            {onboarding?.is_completed
              ? `Atualizado em ${new Date(onboarding.updated_at).toLocaleDateString('pt-BR')}`
              : 'Paciente ainda não finalizou o questionário inicial'}
          </p>
        </div>
      </div>

      {/* Dados do Onboarding do Paciente (Se Preenchido) */}
      {onboarding && (
        <div className="p-6 rounded-2xl border border-zinc-800 bg-zinc-900/30 space-y-6">
          <h2 className="text-base font-bold text-white flex items-center space-x-2">
            <Target className="w-4 h-4 text-emerald-400" />
            <span>Respostas do Onboarding Inicial</span>
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-xs">
            <div className="p-4 rounded-xl bg-zinc-950/60 border border-zinc-800/80 space-y-1">
              <div className="text-zinc-400">Objetivo Principal</div>
              <div className="text-sm font-bold text-emerald-400">
                {GOAL_LABELS[onboarding.primary_goal] || onboarding.primary_goal}
              </div>
            </div>

            <div className="p-4 rounded-xl bg-zinc-950/60 border border-zinc-800/80 space-y-1">
              <div className="text-zinc-400 flex items-center space-x-1">
                <Ruler className="w-3.5 h-3.5 text-zinc-500" />
                <span>Altura</span>
              </div>
              <div className="text-sm font-bold text-white">
                {onboarding.height_cm ? `${onboarding.height_cm} cm` : 'Não informada'}
              </div>
            </div>

            <div className="p-4 rounded-xl bg-zinc-950/60 border border-zinc-800/80 space-y-1">
              <div className="text-zinc-400 flex items-center space-x-1">
                <Scale className="w-3.5 h-3.5 text-zinc-500" />
                <span>Peso Inicial</span>
              </div>
              <div className="text-sm font-bold text-white">
                {onboarding.weight_kg ? `${onboarding.weight_kg} kg` : 'Não informado'}
              </div>
            </div>

            <div className="p-4 rounded-xl bg-zinc-950/60 border border-zinc-800/80 space-y-1">
              <div className="text-zinc-400 flex items-center space-x-1">
                <MapPin className="w-3.5 h-3.5 text-zinc-500" />
                <span>Localização</span>
              </div>
              <div className="text-sm font-bold text-white">
                {onboarding.city ? `${onboarding.city}, ` : ''}{onboarding.country}
              </div>
            </div>
          </div>

          <div className="text-xs text-zinc-400 grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
            <div>
              <span className="text-zinc-500">Gênero:</span>{' '}
              <strong className="text-zinc-200">
                {onboarding.gender ? GENDER_LABELS[onboarding.gender] || onboarding.gender : 'Não informado'}
              </strong>
            </div>
            <div>
              <span className="text-zinc-500">Data de Nascimento:</span>{' '}
              <strong className="text-zinc-200">
                {onboarding.birth_date
                  ? new Date(onboarding.birth_date + 'T00:00:00').toLocaleDateString('pt-BR')
                  : 'Não informada'}
              </strong>
            </div>
          </div>
        </div>
      )}

      {/* Seção do Perfil Nutricional Completo (Etapa 3) */}
      <div className="p-6 rounded-2xl border border-zinc-800 bg-zinc-900/40 space-y-5">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
          <div className="flex items-center space-x-2 text-xs font-bold uppercase text-zinc-400">
            <Apple className="w-4 h-4 text-emerald-400" />
            <span>Perfil Nutricional Estruturado (Etapa 3)</span>
          </div>

          {nutritionProfile ? (
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-zinc-400">Completude:</span>
              <span className="text-xs font-bold text-emerald-400">
                {nutritionProfile.completion_percentage}%
              </span>
              <span className="text-[10px] bg-zinc-800 text-zinc-300 px-2 py-0.5 rounded">
                v{nutritionProfile.version}
              </span>
            </div>
          ) : (
            <span className="text-xs text-zinc-500">Não preenchido</span>
          )}
        </div>

        {nutritionProfile ? (
          <div className="space-y-5">
            {/* Grid 1: Corporais & Rotina */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-3.5 rounded-xl bg-zinc-950/60 border border-zinc-800/80 space-y-1">
                <div className="text-[11px] text-zinc-400 font-medium">Peso & Altura</div>
                <div className="text-sm font-bold text-white">
                  {nutritionProfile.current_weight_kg ? `${nutritionProfile.current_weight_kg} kg` : '—'} /{' '}
                  {nutritionProfile.height_cm ? `${nutritionProfile.height_cm} cm` : '—'}
                </div>
                {nutritionProfile.target_weight_kg && (
                  <div className="text-[11px] text-zinc-400">Meta: {nutritionProfile.target_weight_kg} kg</div>
                )}
              </div>

              <div className="p-3.5 rounded-xl bg-zinc-950/60 border border-zinc-800/80 space-y-1">
                <div className="text-[11px] text-zinc-400 font-medium">Orçamento Alimentar</div>
                <div className="text-sm font-bold text-white">
                  R$ {nutritionProfile.food_budget_amount || 0} / {nutritionProfile.food_budget_period || 'mês'}
                </div>
                <div className="text-[11px] text-zinc-400">
                  {nutritionProfile.is_budget_exclusive_for_patient ? 'Individual' : `${nutritionProfile.number_of_people_in_household} pessoas`}
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-zinc-950/60 border border-zinc-800/80 space-y-1">
                <div className="text-[11px] text-zinc-400 font-medium">Rotina & Sono</div>
                <div className="text-sm font-bold text-white">
                  {nutritionProfile.average_sleep_hours ? `${nutritionProfile.average_sleep_hours}h de sono` : '—'}
                </div>
                <div className="text-[11px] text-zinc-400">
                  {nutritionProfile.wake_time || '—'} às {nutritionProfile.sleep_time || '—'}
                </div>
              </div>
            </div>

            {/* Preferências & Recusas */}
            <div className="p-4 bg-zinc-950/60 border border-zinc-800/80 rounded-xl space-y-2 text-xs">
              <div>
                <span className="text-zinc-400 font-medium">Padrão Alimentar: </span>
                <span className="text-white font-semibold capitalize">{nutritionProfile.dietary_pattern || 'Não informado'}</span>
              </div>
              {nutritionProfile.foods_patient_refuses && nutritionProfile.foods_patient_refuses.length > 0 && (
                <div>
                  <span className="text-rose-400 font-medium">Recusas Terminantes: </span>
                  <span className="text-zinc-200">{nutritionProfile.foods_patient_refuses.join(', ')}</span>
                </div>
              )}
              {nutritionProfile.preferred_protein_sources && nutritionProfile.preferred_protein_sources.length > 0 && (
                <div>
                  <span className="text-emerald-400 font-medium">Proteínas Favoritas: </span>
                  <span className="text-zinc-200">{nutritionProfile.preferred_protein_sources.join(', ')}</span>
                </div>
              )}
            </div>

            {/* Bloco de Dados Sensíveis Clínicos */}
            {canViewSensitive ? (
              <div className="p-4 bg-amber-950/20 border border-amber-500/30 rounded-xl space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold text-amber-400">
                  <ShieldCheck className="w-4 h-4" />
                  <span>Dados Clínicos Sensíveis (Sigilo Nutricional)</span>
                </div>
                <div className="text-xs text-zinc-300 space-y-1 pt-1">
                  <div>
                    <span className="text-zinc-400">Alergias / Intolerâncias: </span>
                    <span className="text-amber-200 font-medium">
                      {(nutritionProfile.food_allergies || []).join(', ') || 'Nenhuma informada'}
                    </span>
                  </div>
                  {nutritionProfile.medical_dietary_notes && (
                    <div>
                      <span className="text-zinc-400">Notas Médicas: </span>
                      <span className="text-white">{nutritionProfile.medical_dietary_notes}</span>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-xl flex items-center gap-2 text-xs text-zinc-500">
                <AlertTriangle className="w-4 h-4 text-zinc-500" />
                <span>Dados clínicos sensíveis (alergias e notas médicas) restritos a nutricionistas habilitados.</span>
              </div>
            )}
          </div>
        ) : (
          <div className="text-xs text-zinc-500 py-3">
            O paciente ainda não iniciou o preenchimento do questionário nutricional de 8 etapas.
          </div>
        )}
      </div>

      {/* Seção do Motor Nutricional Determinístico (Etapa 4) */}
      <div className="p-6 rounded-2xl border border-zinc-800 bg-zinc-900/40 space-y-5">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
          <div className="flex items-center space-x-2">
            <Apple className="w-5 h-5 text-sky-400" />
            <h2 className="text-base font-bold text-white">Parâmetros do Motor Nutricional</h2>
          </div>
          {engineData?.run ? (
            <div className="flex items-center gap-2">
              <span
                className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-wider ${
                  engineData.run.status === 'calculated'
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                }`}
              >
                {String(engineData.run.status)}
              </span>
              <span className="text-[10px] bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded font-mono">
                {String(engineData.run.engine_version)}
              </span>
            </div>
          ) : (
            <span className="text-xs text-zinc-500">Não calculado</span>
          )}
        </div>

        {engineData?.targets ? (
          <div className="space-y-4">
            {/* Grid 1: Fisiologia Basal & Gasto Energético */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-3.5 rounded-xl bg-zinc-950/60 border border-zinc-800/80 space-y-1">
                <div className="text-[11px] text-zinc-400 font-medium">BMR (Mifflin-St Jeor)</div>
                <div className="text-sm font-bold text-white">
                  {engineData.targets.estimated_bmr_kcal} kcal/dia
                </div>
                <div className="text-[10px] text-zinc-500 font-mono">
                  v{engineData.targets.bmr_formula_version}
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-zinc-950/60 border border-zinc-800/80 space-y-1">
                <div className="text-[11px] text-zinc-400 font-medium">TDEE Estimado</div>
                <div className="text-sm font-bold text-white">
                  {engineData.targets.estimated_tdee_kcal} kcal/dia
                </div>
                <div className="text-[10px] text-zinc-500 capitalize">
                  Fator {engineData.targets.activity_factor} ({engineData.targets.activity_level})
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-zinc-950/60 border border-zinc-800/80 space-y-1">
                <div className="text-[11px] text-zinc-400 font-medium">Meta Calórica Nominal</div>
                <div className="text-sm font-bold text-sky-400">
                  {engineData.targets.target_calories_nominal_kcal} kcal/dia
                </div>
                <div className="text-[10px] text-zinc-500">
                  Faixa: {engineData.targets.target_calories_min_kcal} - {engineData.targets.target_calories_max_kcal} kcal
                </div>
              </div>
            </div>

            {/* Grid 2: Distribuição de Macronutrientes */}
            <div className="p-4 bg-zinc-950/60 border border-zinc-800/80 rounded-xl space-y-3">
              <div className="text-xs font-bold text-zinc-300 uppercase tracking-wider">
                Distribuição de Macronutrientes (Conservação Energética)
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3 bg-zinc-900/60 rounded-lg border border-zinc-800">
                  <div className="text-[11px] text-zinc-400">Proteína</div>
                  <div className="text-base font-bold text-emerald-400">{engineData.targets.protein_g} g</div>
                  <div className="text-[11px] text-zinc-500">
                    {engineData.targets.protein_kcal} kcal ({engineData.targets.protein_percentage}%)
                  </div>
                </div>

                <div className="p-3 bg-zinc-900/60 rounded-lg border border-zinc-800">
                  <div className="text-[11px] text-zinc-400">Carboidrato</div>
                  <div className="text-base font-bold text-amber-400">{engineData.targets.carbohydrate_g} g</div>
                  <div className="text-[11px] text-zinc-500">
                    {engineData.targets.carbohydrate_kcal} kcal ({engineData.targets.carbohydrate_percentage}%)
                  </div>
                </div>

                <div className="p-3 bg-zinc-900/60 rounded-lg border border-zinc-800">
                  <div className="text-[11px] text-zinc-400">Gordura</div>
                  <div className="text-base font-bold text-sky-400">{engineData.targets.fat_g} g</div>
                  <div className="text-[11px] text-zinc-500">
                    {engineData.targets.fat_kcal} kcal ({engineData.targets.fat_percentage}%)
                  </div>
                </div>
              </div>
            </div>

            {/* Grid 3: Orçamento e Refeições */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="p-3.5 bg-zinc-950/60 border border-zinc-800/80 rounded-xl space-y-1">
                <div className="text-[11px] text-zinc-400 font-medium">Orçamento Normalizado</div>
                <div className="text-sm font-bold text-white">
                  R$ {engineData.targets.normalized_daily_budget} / dia (R$ {engineData.targets.normalized_monthly_budget} / mês)
                </div>
                <div className="text-[10px] text-zinc-500">
                  Modalidade: {engineData.targets.budget_estimate_type === 'individual_exact' ? 'Individual' : 'Rateio Domiciliar'}
                </div>
              </div>

              <div className="p-3.5 bg-zinc-950/60 border border-zinc-800/80 rounded-xl space-y-1">
                <div className="text-[11px] text-zinc-400 font-medium">Refeições e Média Calórica</div>
                <div className="text-sm font-bold text-white">
                  {engineData.targets.desired_meals_per_day} refeições / dia
                </div>
                <div className="text-[10px] text-zinc-500">
                  Média de ~{engineData.targets.calories_per_meal_average} kcal por refeição
                </div>
              </div>
            </div>

            {/* Triagem de Segurança & Reason Codes */}
            {Boolean(engineData.run.requires_professional_review) && (
              <div className="p-3.5 bg-amber-500/10 border border-amber-500/20 rounded-xl space-y-1 text-xs">
                <div className="font-bold text-amber-400 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4" />
                  <span>Sinalizações de Triagem Clínica / Revisão Necessária</span>
                </div>
                {canViewSensitive ? (
                  <div className="flex flex-wrap gap-1 pt-1">
                    {(engineData.displayReasonCodes || []).map((code) => (
                      <span
                        key={code}
                        className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-mono text-[10px]"
                      >
                        {code}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-zinc-400 text-[11px]">
                    Revisão por profissional habilitado necessária.
                  </p>
                )}
                {engineData.targets?.target_was_clamped && (
                  <div className="text-[10px] text-amber-300 font-mono pt-1">
                    Guardrail operacional acionado: {engineData.targets.clamp_reason} (cálculo matemático pré-clamp: {engineData.targets.raw_target_calories_nominal_kcal} kcal/dia).
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="text-xs text-zinc-500 py-2">
            Nenhuma meta nutricional calculada para este paciente até o momento.
          </div>
        )}
      </div>

      {/* Nota Restritiva da Etapa 4 */}
      <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-950 text-xs text-zinc-500 text-center">
        Parâmetros do motor nutricional determinístico calculados sem IA. Geração de refeições, cardápios e seleção de alimentos serão introduzidos na próxima etapa.
      </div>
    </div>
  );
}
