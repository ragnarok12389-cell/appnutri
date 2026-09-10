'use client';

import React, { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  User,
  Target,
  Clock,
  Utensils,
  Heart,
  DollarSign,
  ChefHat,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  Save,
  AlertCircle,
  Sparkles,
  ShieldCheck,
  Plus,
  X,
} from 'lucide-react';
import {
  PatientNutritionProfile,
  FullPatientNutritionData,
  PrimaryGoal,
  RateOfChange,
  WorkType,
  ActivityLevel,
  DietaryPattern,
  BudgetPeriod,
  BudgetFlexibility,
  ShoppingFrequency,
  CookingSkillLevel,
  NutritionChallenge,
} from '@/types/nutrition-profile';
import { saveNutritionProfileStepAction, completeNutritionProfileAction } from '@/app/actions/nutrition-profile';
import type { EquipmentType } from '@/types/workout-engine';

interface Props {
  initialProfile: FullPatientNutritionData | null;
}

const STEPS = [
  { id: 1, title: 'Sobre Você', subtitle: 'Medidas e dados corporais', icon: User },
  { id: 2, title: 'Objetivo', subtitle: 'Metas e ritmo desejado', icon: Target },
  { id: 3, title: 'Rotina & Atividade', subtitle: 'Horários, sono e exercícios', icon: Clock },
  { id: 4, title: 'Alimentação', subtitle: 'Refeições e horários', icon: Utensils },
  { id: 5, title: 'Preferências', subtitle: 'Alimentos favoritos, recusas e alergias', icon: Heart },
  { id: 6, title: 'Orçamento', subtitle: 'Investimento e compras', icon: DollarSign },
  { id: 7, title: 'Cozinha & Hábitos', subtitle: 'Preparo, água e dificuldades', icon: ChefHat },
  { id: 8, title: 'Revisão', subtitle: 'Conferência e finalização', icon: CheckCircle2 },
];

export default function NutritionProfileWizard({ initialProfile }: Props) {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(1);
  const [isPending, startTransition] = useTransition();
  const [saveMessage, setSaveMessage] = useState<{ text: string; isError?: boolean } | null>(null);

  // Estado do formulário
  const [formData, setFormData] = useState<Partial<FullPatientNutritionData>>({
    height_cm: initialProfile?.height_cm ?? null,
    current_weight_kg: initialProfile?.current_weight_kg ?? null,
    target_weight_kg: initialProfile?.target_weight_kg ?? null,
    birth_date: initialProfile?.birth_date ?? '',
    biological_sex: initialProfile?.biological_sex ?? null,
    waist_cm: initialProfile?.waist_cm ?? null,
    body_fat_percentage: initialProfile?.body_fat_percentage ?? null,

    primary_goal: initialProfile?.primary_goal ?? null,
    desired_rate_of_change: initialProfile?.desired_rate_of_change ?? 'moderate',
    target_date: initialProfile?.target_date ?? '',

    wake_time: initialProfile?.wake_time ?? '06:30',
    sleep_time: initialProfile?.sleep_time ?? '22:30',
    average_sleep_hours: initialProfile?.average_sleep_hours ?? 8,
    work_start_time: initialProfile?.work_start_time ?? '08:00',
    work_end_time: initialProfile?.work_end_time ?? '17:00',
    work_type: initialProfile?.work_type ?? 'sedentary',
    usual_training_time: initialProfile?.usual_training_time ?? '18:30',
    weekday_routine: initialProfile?.weekday_routine ?? '',
    weekend_routine: initialProfile?.weekend_routine ?? '',
    activity_level: initialProfile?.activity_level ?? 'moderate',
    training_days_per_week: initialProfile?.training_days_per_week ?? 4,
    training_duration_minutes: initialProfile?.training_duration_minutes ?? 60,
    training_types: initialProfile?.training_types ?? ['strength_training'],
    available_workout_equipment: initialProfile?.available_workout_equipment ?? ['bodyweight'],

    desired_meals_per_day: initialProfile?.desired_meals_per_day ?? 4,
    usual_meals_per_day: initialProfile?.usual_meals_per_day ?? 3,
    breakfast_habit: initialProfile?.breakfast_habit ?? '',
    lunch_habit: initialProfile?.lunch_habit ?? '',
    dinner_habit: initialProfile?.dinner_habit ?? '',
    snacks_habit: initialProfile?.snacks_habit ?? '',
    skips_breakfast: initialProfile?.skips_breakfast ?? false,
    irregular_work_schedule: initialProfile?.irregular_work_schedule ?? false,
    works_night_shifts: initialProfile?.works_night_shifts ?? false,
    eats_out_frequently: initialProfile?.eats_out_frequently ?? false,
    needs_packed_meals: initialProfile?.needs_packed_meals ?? false,

    dietary_pattern: initialProfile?.dietary_pattern ?? 'omnivore',
    uses_supplements: initialProfile?.uses_supplements ?? false,
    current_supplements: initialProfile?.current_supplements ?? [],
    favorite_foods: initialProfile?.favorite_foods ?? [],
    disliked_foods: initialProfile?.disliked_foods ?? [],
    foods_patient_refuses: initialProfile?.foods_patient_refuses ?? [],
    preferred_protein_sources: initialProfile?.preferred_protein_sources ?? [],
    preferred_carbohydrate_sources: initialProfile?.preferred_carbohydrate_sources ?? [],
    preferred_fat_sources: initialProfile?.preferred_fat_sources ?? [],
    preferred_fruits: initialProfile?.preferred_fruits ?? [],
    preferred_vegetables: initialProfile?.preferred_vegetables ?? [],
    cuisine_preferences: initialProfile?.cuisine_preferences ?? [],
    food_allergies: initialProfile?.food_allergies ?? [],
    food_intolerances: initialProfile?.food_intolerances ?? [],
    clinical_dietary_restrictions: initialProfile?.clinical_dietary_restrictions ?? [],
    religious_or_cultural_restrictions: initialProfile?.religious_or_cultural_restrictions ?? [],
    medical_dietary_notes: initialProfile?.medical_dietary_notes ?? '',

    food_budget_amount: initialProfile?.food_budget_amount ?? 600,
    food_budget_period: initialProfile?.food_budget_period ?? 'monthly',
    currency: initialProfile?.currency ?? 'BRL',
    budget_flexibility: initialProfile?.budget_flexibility ?? 'moderate',
    number_of_people_in_household: initialProfile?.number_of_people_in_household ?? 1,
    is_budget_exclusive_for_patient: initialProfile?.is_budget_exclusive_for_patient ?? true,
    country: initialProfile?.country ?? 'BR',
    state_region: initialProfile?.state_region ?? '',
    city: initialProfile?.city ?? '',
    preferred_stores: initialProfile?.preferred_stores ?? [],
    shopping_frequency: initialProfile?.shopping_frequency ?? 'weekly',

    can_cook: initialProfile?.can_cook ?? true,
    cooking_skill_level: initialProfile?.cooking_skill_level ?? 'basic',
    available_cooking_time_minutes: initialProfile?.available_cooking_time_minutes ?? 45,
    meal_prep_days: initialProfile?.meal_prep_days ?? [],
    has_refrigerator: initialProfile?.has_refrigerator ?? true,
    has_freezer: initialProfile?.has_freezer ?? true,
    has_microwave: initialProfile?.has_microwave ?? true,
    has_stove: initialProfile?.has_stove ?? true,
    has_air_fryer: initialProfile?.has_air_fryer ?? false,
    meals_out_per_week: initialProfile?.meals_out_per_week ?? 2,
    uses_delivery_frequency: initialProfile?.uses_delivery_frequency ?? 'weekly_1_2',
    eats_at_work: initialProfile?.eats_at_work ?? false,
    work_refrigerator_available: initialProfile?.work_refrigerator_available ?? true,
    work_microwave_available: initialProfile?.work_microwave_available ?? true,

    water_intake_liters: initialProfile?.water_intake_liters ?? 2.0,
    alcohol_frequency: initialProfile?.alcohol_frequency ?? 'rarely',
    soft_drink_frequency: initialProfile?.soft_drink_frequency ?? 'rarely',
    coffee_frequency: initialProfile?.coffee_frequency ?? '1_cup_day',
    fast_food_frequency: initialProfile?.fast_food_frequency ?? 'rarely',
    late_night_eating: initialProfile?.late_night_eating ?? false,
    emotional_eating_reported: initialProfile?.emotional_eating_reported ?? false,
    hunger_pattern: initialProfile?.hunger_pattern ?? 'afternoon',
    primary_challenges: initialProfile?.primary_challenges ?? ['consistency'],
    challenges_notes: initialProfile?.challenges_notes ?? '',
    followed_diet_before: initialProfile?.followed_diet_before ?? false,
    what_worked_before: initialProfile?.what_worked_before ?? '',
    what_failed_before: initialProfile?.what_failed_before ?? '',
    foods_or_methods_refused: initialProfile?.foods_or_methods_refused ?? '',
  });

  const [completeness, setCompleteness] = useState(initialProfile?.completion_percentage || 0);

  // Helper de input para tags/listas
  const [customTagInput, setCustomTagInput] = useState<{ [key: string]: string }>({});

  const addTag = (field: keyof FullPatientNutritionData, value: string) => {
    if (!value.trim()) return;
    const current = (formData[field] as string[]) || [];
    if (!current.includes(value.trim())) {
      setFormData({ ...formData, [field]: [...current, value.trim()] });
    }
    setCustomTagInput({ ...customTagInput, [field]: '' });
  };

  const removeTag = (field: keyof FullPatientNutritionData, value: string) => {
    const current = (formData[field] as string[]) || [];
    setFormData({ ...formData, [field]: current.filter((item) => item !== value) });
  };

  // Salva a etapa atual no servidor
  const saveCurrentStep = async (stepNum: number) => {
    setSaveMessage(null);
    return new Promise<boolean>((resolve) => {
      startTransition(async () => {
        const res = await saveNutritionProfileStepAction(stepNum, formData as Record<string, unknown>);
        if (res.error) {
          setSaveMessage({ text: res.error, isError: true });
          resolve(false);
        } else if (res.data) {
          setCompleteness(res.data.completionPercentage);
          setSaveMessage({ text: 'Alterações salvas com sucesso!' });
          setTimeout(() => setSaveMessage(null), 3000);
          resolve(true);
        }
      });
    });
  };

  const handleNext = async () => {
    const ok = await saveCurrentStep(currentStep);
    if (ok && currentStep < 8) {
      setCurrentStep(currentStep + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handlePrev = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleComplete = async () => {
    setSaveMessage(null);
    startTransition(async () => {
      const res = await completeNutritionProfileAction();
      if (res.error) {
        setSaveMessage({ text: res.error, isError: true });
      } else {
        router.push('/patient?profile_completed=true');
      }
    });
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Top Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link
            href="/patient"
            className="inline-flex items-center gap-1.5 text-xs text-neutral-400 hover:text-emerald-400 mb-2 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Voltar ao Dashboard
          </Link>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <span>Perfil Nutricional Completo</span>
            <span className="text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full font-medium">
              v{initialProfile?.version || 1}
            </span>
          </h1>
          <p className="text-sm text-neutral-400 mt-0.5">
            Preencha com atenção. Seus dados serão o alicerce para sua futura dieta personalizada.
          </p>
        </div>

        {/* Badge de completude */}
        <div className="text-right bg-neutral-900 border border-neutral-800 px-4 py-2.5 rounded-xl">
          <div className="text-xs text-neutral-400 mb-0.5">Completude Geral</div>
          <div className="flex items-center gap-2">
            <div className="w-24 bg-neutral-800 rounded-full h-2 overflow-hidden">
              <div
                className={`h-full transition-all duration-500 ${
                  completeness >= 80 ? 'bg-emerald-500' : completeness >= 40 ? 'bg-amber-500' : 'bg-rose-500'
                }`}
                style={{ width: `${completeness}%` }}
              />
            </div>
            <span className="text-sm font-bold text-white">{completeness}%</span>
          </div>
        </div>
      </div>

      {/* Stepper Navigation */}
      <div className="grid grid-cols-4 sm:grid-cols-8 gap-1.5 mb-8 bg-neutral-900/60 p-2 rounded-2xl border border-neutral-800/80">
        {STEPS.map((step) => {
          const Icon = step.icon;
          const isActive = currentStep === step.id;
          const isPassed = currentStep > step.id;

          return (
            <button
              key={step.id}
              onClick={async () => {
                if (step.id !== currentStep) {
                  await saveCurrentStep(currentStep);
                  setCurrentStep(step.id);
                }
              }}
              className={`flex flex-col items-center p-2.5 rounded-xl transition-all text-center ${
                isActive
                  ? 'bg-emerald-500 text-neutral-950 font-bold shadow-lg shadow-emerald-500/20'
                  : isPassed
                  ? 'text-emerald-400 hover:bg-neutral-800'
                  : 'text-neutral-500 hover:text-neutral-300 hover:bg-neutral-800/50'
              }`}
            >
              <Icon className="w-4 h-4 mb-1" />
              <span className="text-[10px] leading-tight line-clamp-1">{step.title}</span>
            </button>
          );
        })}
      </div>

      {/* Save Toast Message */}
      {saveMessage && (
        <div
          className={`mb-6 p-3 rounded-xl border text-sm flex items-center gap-2 transition-all ${
            saveMessage.isError
              ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
              : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
          }`}
        >
          {saveMessage.isError ? (
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
          ) : (
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
          )}
          <span>{saveMessage.text}</span>
        </div>
      )}

      {/* Content Form Block */}
      <div className="bg-neutral-900/90 border border-neutral-800 rounded-2xl p-6 sm:p-8 shadow-xl">
        {/* ETAPA 1: SOBRE VOCÊ */}
        {currentStep === 1 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <User className="w-5 h-5 text-emerald-400" />
                Etapa 1: Características Físicas e Corporais
              </h2>
              <p className="text-xs text-neutral-400 mt-1">
                Dados essenciais para que o profissional e os futuros cálculos fisiológicos conheçam seu perfil.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                  Altura (cm) *
                </label>
                <input
                  type="number"
                  value={formData.height_cm || ''}
                  onChange={(e) => setFormData({ ...formData, height_cm: Number(e.target.value) || null })}
                  placeholder="Ex: 175"
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-2.5 text-white text-sm focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                  Peso Atual (kg) *
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={formData.current_weight_kg || ''}
                  onChange={(e) => setFormData({ ...formData, current_weight_kg: Number(e.target.value) || null })}
                  placeholder="Ex: 78.5"
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-2.5 text-white text-sm focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                  Peso Meta Desejado (kg)
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={formData.target_weight_kg || ''}
                  onChange={(e) => setFormData({ ...formData, target_weight_kg: Number(e.target.value) || null })}
                  placeholder="Ex: 72.0"
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-2.5 text-white text-sm focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                  Data de Nascimento *
                </label>
                <input
                  type="date"
                  value={formData.birth_date || ''}
                  onChange={(e) => setFormData({ ...formData, birth_date: e.target.value })}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-2.5 text-white text-sm focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                  Sexo Biológico (Fisiológico) *
                </label>
                <select
                  value={formData.biological_sex || ''}
                  onChange={(e) => setFormData({ ...formData, biological_sex: (e.target.value as 'male' | 'female') || null })}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-2.5 text-white text-sm focus:border-emerald-500 focus:outline-none"
                >
                  <option value="">Selecione...</option>
                  <option value="male">Masculino</option>
                  <option value="female">Feminino</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                  Circunferência Abdominal / Cintura (cm, opcional)
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={formData.waist_cm || ''}
                  onChange={(e) => setFormData({ ...formData, waist_cm: Number(e.target.value) || null })}
                  placeholder="Ex: 84"
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-2.5 text-white text-sm focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                  Percentual de Gordura Estimado (%, opcional)
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={formData.body_fat_percentage || ''}
                  onChange={(e) => setFormData({ ...formData, body_fat_percentage: Number(e.target.value) || null })}
                  placeholder="Ex: 18.5"
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-2.5 text-white text-sm focus:border-emerald-500 focus:outline-none"
                />
              </div>
            </div>
          </div>
        )}

        {/* ETAPA 2: SEU OBJETIVO */}
        {currentStep === 2 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Target className="w-5 h-5 text-emerald-400" />
                Etapa 2: Objetivo Estruturado
              </h2>
              <p className="text-xs text-neutral-400 mt-1">
                Qual é a sua meta principal e a velocidade pretendida para alcançá-la?
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-2">
                  Objetivo Primário *
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {[
                    { id: 'lose_weight', title: 'Emagrecimento', desc: 'Perda de gordura com preservação de massa' },
                    { id: 'gain_muscle', title: 'Hipertrofia Muscular', desc: 'Ganho de massa magra e densidade' },
                    { id: 'body_recomposition', title: 'Recomposição Corporal', desc: 'Perder gordura e ganhar músculo simultaneamente' },
                    { id: 'maintain_weight', title: 'Manutenção de Peso', desc: 'Estabilidade calórica e energia constante' },
                    { id: 'improve_health', title: 'Melhora da Saúde', desc: 'Controle de exames, digestão e longevidade' },
                    { id: 'improve_performance', title: 'Performance Esportiva', desc: 'Rendimento para corridas, treinos ou competições' },
                  ].map((goal) => (
                    <button
                      key={goal.id}
                      type="button"
                      onClick={() => setFormData({ ...formData, primary_goal: goal.id as PrimaryGoal })}
                      className={`p-3.5 rounded-xl border text-left transition-all ${
                        formData.primary_goal === goal.id
                          ? 'border-emerald-500 bg-emerald-500/10 text-white shadow-sm'
                          : 'border-neutral-800 bg-neutral-950 text-neutral-400 hover:border-neutral-700'
                      }`}
                    >
                      <div className="font-semibold text-sm text-white mb-1">{goal.title}</div>
                      <div className="text-[11px] text-neutral-400 leading-snug">{goal.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <div>
                  <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                    Ritmo de Mudança Desejado
                  </label>
                  <select
                    value={formData.desired_rate_of_change || 'moderate'}
                    onChange={(e) => setFormData({ ...formData, desired_rate_of_change: e.target.value as RateOfChange })}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-2.5 text-white text-sm focus:border-emerald-500 focus:outline-none"
                  >
                    <option value="slow">Gradual e Sustentável (Foco em longevidade)</option>
                    <option value="moderate">Moderado e Equilibrado (Recomendado)</option>
                    <option value="fast">Acelerado (Requer alta disciplina)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                    Data Alvo Estimada (Opcional)
                  </label>
                  <input
                    type="date"
                    value={formData.target_date || ''}
                    onChange={(e) => setFormData({ ...formData, target_date: e.target.value })}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-2.5 text-white text-sm focus:border-emerald-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ETAPA 3: ROTINA & ATIVIDADE */}
        {currentStep === 3 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Clock className="w-5 h-5 text-emerald-400" />
                Etapa 3: Rotina Diária & Exercício Físico
              </h2>
              <p className="text-xs text-neutral-400 mt-1">
                Conhecer seus horários é fundamental para distribuir as refeições no momento adequado.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                  Horário de Acordar
                </label>
                <input
                  type="time"
                  value={formData.wake_time || ''}
                  onChange={(e) => setFormData({ ...formData, wake_time: e.target.value })}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-2 text-white text-sm focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                  Horário de Dormir
                </label>
                <input
                  type="time"
                  value={formData.sleep_time || ''}
                  onChange={(e) => setFormData({ ...formData, sleep_time: e.target.value })}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-2 text-white text-sm focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                  Média de Horas de Sono
                </label>
                <input
                  type="number"
                  step="0.5"
                  value={formData.average_sleep_hours || ''}
                  onChange={(e) => setFormData({ ...formData, average_sleep_hours: Number(e.target.value) || null })}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-2 text-white text-sm focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                  Tipo de Trabalho
                </label>
                <select
                  value={formData.work_type || 'sedentary'}
                  onChange={(e) => setFormData({ ...formData, work_type: e.target.value as WorkType })}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-2 text-white text-sm focus:border-emerald-500 focus:outline-none"
                >
                  <option value="sedentary">Sedentário (Maioria do tempo sentado / computador)</option>
                  <option value="mixed">Misto (Alterna entre sentado e em pé/caminhando)</option>
                  <option value="physical">Físico / Braçal (Constante esforço e movimento)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                  Nível de Atividade Geral
                </label>
                <select
                  value={formData.activity_level || 'moderate'}
                  onChange={(e) => setFormData({ ...formData, activity_level: e.target.value as ActivityLevel })}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-2 text-white text-sm focus:border-emerald-500 focus:outline-none"
                >
                  <option value="sedentary">Sedentário (pouco ou nenhum exercício)</option>
                  <option value="light">Leve (exercício 1 a 3 dias/semana)</option>
                  <option value="moderate">Moderado (exercício 3 a 5 dias/semana)</option>
                  <option value="high">Intenso (exercício 6 a 7 dias/semana)</option>
                  <option value="very_high">Muito Intenso (atletas ou treinos bi-diários)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                  Dias de Treino por Semana
                </label>
                <input
                  type="number"
                  min="0"
                  max="7"
                  value={formData.training_days_per_week ?? ''}
                  onChange={(e) => setFormData({ ...formData, training_days_per_week: Number(e.target.value) })}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-2 text-white text-sm focus:border-emerald-500 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                Modalidades de Treino Praticadas
              </label>
              <div className="flex flex-wrap gap-2 mb-2">
                {[
                  { id: 'strength_training', label: 'Musculação / Força' },
                  { id: 'running', label: 'Corrida' },
                  { id: 'cycling', label: 'Ciclismo' },
                  { id: 'crossfit', label: 'Crossfit / Funcional' },
                  { id: 'sports', label: 'Esportes de Quadra / Luta' },
                  { id: 'walking', label: 'Caminhada' },
                  { id: 'none', label: 'Nenhuma no momento' },
                ].map((item) => {
                  const isSelected = (formData.training_types || []).includes(item.id);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        const current = formData.training_types || [];
                        if (isSelected) {
                          setFormData({ ...formData, training_types: current.filter((x) => x !== item.id) });
                        } else {
                          setFormData({ ...formData, training_types: [...current, item.id] });
                        }
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                        isSelected
                          ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300'
                          : 'bg-neutral-950 border-neutral-800 text-neutral-400 hover:border-neutral-700'
                      }`}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                Equipamentos que você realmente tem disponíveis
              </label>
              <p className="text-[11px] text-neutral-500 mb-2">
                O treino será montado somente com as opções marcadas. Peso corporal permanece disponível como base segura.
              </p>
              <div className="flex flex-wrap gap-2">
                {[
                  { id: 'bodyweight', label: 'Peso corporal' },
                  { id: 'dumbbell', label: 'Halteres' },
                  { id: 'barbell', label: 'Barra e anilhas' },
                  { id: 'machine', label: 'Máquinas' },
                  { id: 'cable', label: 'Polia / cabo' },
                  { id: 'bench', label: 'Banco' },
                  { id: 'pull_up_bar', label: 'Barra fixa' },
                  { id: 'resistance_band', label: 'Faixa elástica' },
                ].map((item) => {
                  const current = formData.available_workout_equipment || ['bodyweight'];
                  const equipmentId = item.id as EquipmentType;
                  const isSelected = current.includes(equipmentId);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        const next = isSelected
                          ? current.filter((value) => value !== item.id)
                          : [...current, equipmentId];
                        if (next.length > 0) setFormData({ ...formData, available_workout_equipment: next });
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                        isSelected
                          ? 'bg-sky-500/20 border-sky-500 text-sky-300'
                          : 'bg-neutral-950 border-neutral-800 text-neutral-400 hover:border-neutral-700'
                      }`}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ETAPA 4: REFEIÇÕES E HÁBITOS */}
        {currentStep === 4 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Utensils className="w-5 h-5 text-emerald-400" />
                Etapa 4: Estrutura das Refeições
              </h2>
              <p className="text-xs text-neutral-400 mt-1">
                Quantas refeições você gostaria de fazer e quais particularidades marcam seu dia a dia?
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                  Número de Refeições Desejado por Dia
                </label>
                <select
                  value={formData.desired_meals_per_day || 4}
                  onChange={(e) => setFormData({ ...formData, desired_meals_per_day: Number(e.target.value) })}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-2.5 text-white text-sm focus:border-emerald-500 focus:outline-none"
                >
                  <option value="2">2 refeições (Ex: Almoço e Jantar)</option>
                  <option value="3">3 refeições (Café, Almoço e Jantar)</option>
                  <option value="4">4 refeições (Café, Almoço, Lanche e Jantar)</option>
                  <option value="5">5 refeições (Café, Lanche, Almoço, Lanche e Jantar)</option>
                  <option value="6">6 refeições (Refeições menores e frequentes)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                  Número de Refeições que Faz Atualmente
                </label>
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={formData.usual_meals_per_day || 3}
                  onChange={(e) => setFormData({ ...formData, usual_meals_per_day: Number(e.target.value) })}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-2.5 text-white text-sm focus:border-emerald-500 focus:outline-none"
                />
              </div>
            </div>

            {/* Flags de Contexto de Refeição */}
            <div className="space-y-3 pt-2">
              <label className="block text-xs font-medium text-neutral-300">
                Marque todas as situações que se aplicam a você:
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {[
                  { key: 'skips_breakfast', label: 'Costumo pular o café da manhã / jejum matinal' },
                  { key: 'irregular_work_schedule', label: 'Trabalho em horários irregulares' },
                  { key: 'works_night_shifts', label: 'Faço plantões noturnos ou escalas rotativas' },
                  { key: 'eats_out_frequently', label: 'Como fora com frequência durante a semana' },
                  { key: 'needs_packed_meals', label: 'Preciso levar marmitas prontas para o trabalho' },
                ].map((item) => (
                  <label
                    key={item.key}
                    className="flex items-center gap-3 p-3 bg-neutral-950 border border-neutral-800 rounded-xl cursor-pointer hover:border-neutral-700 transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={Boolean(formData[item.key as keyof PatientNutritionProfile])}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          [item.key]: e.target.checked,
                        })
                      }
                      className="w-4 h-4 rounded border-neutral-700 text-emerald-500 focus:ring-emerald-500 bg-neutral-900"
                    />
                    <span className="text-xs text-neutral-300">{item.label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ETAPA 5: PREFERÊNCIAS E RESTRIÇÕES */}
        {currentStep === 5 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Heart className="w-5 h-5 text-emerald-400" />
                Etapa 5: Preferências, Alergias e Restrições
              </h2>
              <p className="text-xs text-neutral-400 mt-1">
                Uma dieta eficiente é aquela que você realmente consegue sustentar. Informe seus gostos e restrições.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                  Padrão Alimentar Primário *
                </label>
                <select
                  value={formData.dietary_pattern || 'omnivore'}
                  onChange={(e) => setFormData({ ...formData, dietary_pattern: e.target.value as DietaryPattern })}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-2.5 text-white text-sm focus:border-emerald-500 focus:outline-none"
                >
                  <option value="omnivore">Onívoro (Come de tudo: carnes, vegetais, ovos)</option>
                  <option value="vegetarian">Vegetariano (Não come carne, consome ovos/laticínios)</option>
                  <option value="vegan">Vegano (100% à base de plantas)</option>
                  <option value="pescatarian">Pescetariano (Vegetais + peixes e frutos do mar)</option>
                  <option value="other">Outro padrão específico</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                  Usa Suplementos Atualmente?
                </label>
                <select
                  value={formData.uses_supplements ? 'true' : 'false'}
                  onChange={(e) => setFormData({ ...formData, uses_supplements: e.target.value === 'true' })}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-2.5 text-white text-sm focus:border-emerald-500 focus:outline-none"
                >
                  <option value="false">Não uso suplementos</option>
                  <option value="true">Sim, uso suplementos (Creatina, Whey, Vitaminas...)</option>
                </select>
              </div>
            </div>

            {/* Fontes Proteicas Favoritas */}
            <div>
              <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                Fontes de Proteína Preferidas
              </label>
              <div className="flex gap-2 mb-2">
                <input
                  type="text"
                  placeholder="Ex: Frango, Ovos, Salmão, Tofu..."
                  value={customTagInput['preferred_protein_sources'] || ''}
                  onChange={(e) => setCustomTagInput({ ...customTagInput, preferred_protein_sources: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addTag('preferred_protein_sources', customTagInput['preferred_protein_sources']);
                    }
                  }}
                  className="flex-1 bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-white text-xs"
                />
                <button
                  type="button"
                  onClick={() => addTag('preferred_protein_sources', customTagInput['preferred_protein_sources'])}
                  className="px-3 py-2 bg-neutral-800 hover:bg-neutral-700 text-white rounded-xl text-xs font-medium flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" /> Adicionar
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {(formData.preferred_protein_sources || []).map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs"
                  >
                    {tag}
                    <button type="button" onClick={() => removeTag('preferred_protein_sources', tag)}>
                      <X className="w-3 h-3 hover:text-white" />
                    </button>
                  </span>
                ))}
              </div>
            </div>

            {/* Alimentos que recusa terminantemente */}
            <div>
              <label className="block text-xs font-medium text-rose-300 mb-1.5">
                Alimentos que você NÃO come de jeito nenhum (Aversões severas)
              </label>
              <div className="flex gap-2 mb-2">
                <input
                  type="text"
                  placeholder="Ex: Fígado, Berinjela, Coentro..."
                  value={customTagInput['foods_patient_refuses'] || ''}
                  onChange={(e) => setCustomTagInput({ ...customTagInput, foods_patient_refuses: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addTag('foods_patient_refuses', customTagInput['foods_patient_refuses']);
                    }
                  }}
                  className="flex-1 bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-white text-xs"
                />
                <button
                  type="button"
                  onClick={() => addTag('foods_patient_refuses', customTagInput['foods_patient_refuses'])}
                  className="px-3 py-2 bg-rose-500/20 text-rose-300 border border-rose-500/30 rounded-xl text-xs font-medium flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" /> Adicionar
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {(formData.foods_patient_refuses || []).map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/20 text-xs"
                  >
                    {tag}
                    <button type="button" onClick={() => removeTag('foods_patient_refuses', tag)}>
                      <X className="w-3 h-3 hover:text-white" />
                    </button>
                  </span>
                ))}
              </div>
            </div>

            {/* Alergias & Intolerâncias */}
            <div className="p-4 bg-neutral-950/80 border border-neutral-800 rounded-xl space-y-4">
              <div className="flex items-center gap-2 text-xs font-bold text-amber-400">
                <ShieldCheck className="w-4 h-4 text-amber-400" />
                Alergias, Intolerâncias e Restrições Médicas (Confidencial)
              </div>
              <p className="text-[11px] text-neutral-400">
                Esses dados são protegidos por sigilo clínico e acessíveis exclusivamente ao nutricionista vinculado.
              </p>

              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1">
                  Alergias ou Intolerâncias (Ex: Glúten, Lactose, Frutos do mar)
                </label>
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    placeholder="Digite e adicione..."
                    value={customTagInput['food_allergies'] || ''}
                    onChange={(e) => setCustomTagInput({ ...customTagInput, food_allergies: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addTag('food_allergies', customTagInput['food_allergies']);
                      }
                    }}
                    className="flex-1 bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-white text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => addTag('food_allergies', customTagInput['food_allergies'])}
                    className="px-3 py-2 bg-neutral-800 hover:bg-neutral-700 text-white rounded-xl text-xs"
                  >
                    Adicionar
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {(formData.food_allergies || []).map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500/10 text-amber-300 border border-amber-500/20 text-xs"
                    >
                      {tag}
                      <button type="button" onClick={() => removeTag('food_allergies', tag)}>
                        <X className="w-3 h-3 hover:text-white" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1">
                  Observações Médicas / Diagnósticos Prévios (Ex: Diabetes, Hipertensão, Gastrite)
                </label>
                <textarea
                  rows={2}
                  value={formData.medical_dietary_notes || ''}
                  onChange={(e) => setFormData({ ...formData, medical_dietary_notes: e.target.value })}
                  placeholder="Relate brevemente condições que o profissional de saúde deve saber..."
                  className="w-full bg-neutral-900 border border-neutral-800 rounded-xl p-3 text-white text-xs focus:border-emerald-500 focus:outline-none"
                />
              </div>
            </div>
          </div>
        )}

        {/* ETAPA 6: SEU ORÇAMENTO */}
        {currentStep === 6 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-emerald-400" />
                Etapa 6: Orçamento Alimentar & Contexto de Compra
              </h2>
              <p className="text-xs text-neutral-400 mt-1">
                A dieta deve caber no seu bolso. O sistema irá gerar combinações compatíveis com a sua realidade financeira.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                  Valor Estimado Disponível (R$) *
                </label>
                <input
                  type="number"
                  min="0"
                  step="10"
                  value={formData.food_budget_amount || ''}
                  onChange={(e) => setFormData({ ...formData, food_budget_amount: Number(e.target.value) || 0 })}
                  placeholder="Ex: 600"
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-2.5 text-white text-sm focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                  Periodicidade do Orçamento *
                </label>
                <select
                  value={formData.food_budget_period || 'monthly'}
                  onChange={(e) => setFormData({ ...formData, food_budget_period: e.target.value as BudgetPeriod })}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-2.5 text-white text-sm focus:border-emerald-500 focus:outline-none"
                >
                  <option value="daily">Por Dia (Diário)</option>
                  <option value="weekly">Por Semana (Semanal)</option>
                  <option value="monthly">Por Mês (Mensal - Recomendado)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                  Este orçamento é exclusivo para você? *
                </label>
                <select
                  value={formData.is_budget_exclusive_for_patient ? 'true' : 'false'}
                  onChange={(e) => setFormData({ ...formData, is_budget_exclusive_for_patient: e.target.value === 'true' })}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-2.5 text-white text-sm focus:border-emerald-500 focus:outline-none"
                >
                  <option value="true">Sim, é apenas para a minha alimentação</option>
                  <option value="false">Não, este valor cobre a alimentação da casa inteira</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                  Pessoas na Residência
                </label>
                <input
                  type="number"
                  min="1"
                  value={formData.number_of_people_in_household || 1}
                  onChange={(e) => setFormData({ ...formData, number_of_people_in_household: Number(e.target.value) || 1 })}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-2.5 text-white text-sm focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                  Flexibilidade Orçamentária
                </label>
                <select
                  value={formData.budget_flexibility || 'moderate'}
                  onChange={(e) => setFormData({ ...formData, budget_flexibility: e.target.value as BudgetFlexibility })}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-2.5 text-white text-sm focus:border-emerald-500 focus:outline-none"
                >
                  <option value="strict">Rígido (Não posso ultrapassar de forma alguma)</option>
                  <option value="moderate">Moderado (Posso flexibilizar pequenas variações)</option>
                  <option value="flexible">Flexível (Preço não é um fator impeditivo)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                  Frequência de Compras
                </label>
                <select
                  value={formData.shopping_frequency || 'weekly'}
                  onChange={(e) => setFormData({ ...formData, shopping_frequency: e.target.value as ShoppingFrequency })}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-2.5 text-white text-sm focus:border-emerald-500 focus:outline-none"
                >
                  <option value="weekly">Semanal (Mais comum para feira/frescos)</option>
                  <option value="biweekly">Quinzenal</option>
                  <option value="monthly">Mensal (Grande compra do mês)</option>
                  <option value="daily">Diária</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                  Cidade
                </label>
                <input
                  type="text"
                  placeholder="Ex: São Paulo"
                  value={formData.city || ''}
                  onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-2 text-white text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                  Estado / Região
                </label>
                <input
                  type="text"
                  placeholder="Ex: SP"
                  value={formData.state_region || ''}
                  onChange={(e) => setFormData({ ...formData, state_region: e.target.value })}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-2 text-white text-sm"
                />
              </div>
            </div>
          </div>
        )}

        {/* ETAPA 7: COZINHA E HÁBITOS */}
        {currentStep === 7 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <ChefHat className="w-5 h-5 text-emerald-400" />
                Etapa 7: Cozinha, Hábitos e Dificuldades
              </h2>
              <p className="text-xs text-neutral-400 mt-1">
                Entender sua estrutura prática nos ajuda a prescrever alimentos que você realmente consegue preparar.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                  Habilidade Culinária
                </label>
                <select
                  value={formData.cooking_skill_level || 'basic'}
                  onChange={(e) => setFormData({ ...formData, cooking_skill_level: e.target.value as CookingSkillLevel })}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-2 text-white text-sm focus:border-emerald-500 focus:outline-none"
                >
                  <option value="none">Nenhuma (Não cozinho / só esquento)</option>
                  <option value="basic">Básica (Ovo, arroz, bifes simples)</option>
                  <option value="intermediate">Intermediária (Preparo receitas variadas)</option>
                  <option value="advanced">Avançada (Domínio de técnicas e temperos)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                  Tempo Médio Disponível p/ Cozinhar (min/dia)
                </label>
                <input
                  type="number"
                  value={formData.available_cooking_time_minutes || 30}
                  onChange={(e) => setFormData({ ...formData, available_cooking_time_minutes: Number(e.target.value) || 0 })}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-2 text-white text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                  Ingestão Média de Água (Litros/dia)
                </label>
                <input
                  type="number"
                  step="0.5"
                  value={formData.water_intake_liters || 2.0}
                  onChange={(e) => setFormData({ ...formData, water_intake_liters: Number(e.target.value) || 0 })}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-2 text-white text-sm"
                />
              </div>
            </div>

            {/* Eletrodomésticos Disponíveis */}
            <div>
              <label className="block text-xs font-medium text-neutral-300 mb-2">
                Eletrodomésticos que você possui:
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {[
                  { key: 'has_refrigerator', label: 'Geladeira' },
                  { key: 'has_freezer', label: 'Freezer' },
                  { key: 'has_microwave', label: 'Micro-ondas' },
                  { key: 'has_stove', label: 'Fogão / Cooktop' },
                  { key: 'has_air_fryer', label: 'Air Fryer' },
                ].map((item) => (
                  <label
                    key={item.key}
                    className="flex items-center gap-2 p-2.5 bg-neutral-950 border border-neutral-800 rounded-xl cursor-pointer hover:border-neutral-700 text-xs text-neutral-300"
                  >
                    <input
                      type="checkbox"
                      checked={Boolean(formData[item.key as keyof PatientNutritionProfile])}
                      onChange={(e) => setFormData({ ...formData, [item.key]: e.target.checked })}
                      className="w-4 h-4 rounded text-emerald-500 bg-neutral-900 border-neutral-700"
                    />
                    {item.label}
                  </label>
                ))}
              </div>
            </div>

            {/* Maiores Dificuldades */}
            <div>
              <label className="block text-xs font-medium text-neutral-300 mb-2">
                Quais são suas maiores dificuldades atuais com alimentação? (Selecione as principais)
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {[
                  { id: 'lack_of_time', label: 'Falta de tempo' },
                  { id: 'budget', label: 'Orçamento apertado' },
                  { id: 'hunger', label: 'Muita fome / saciedade baixa' },
                  { id: 'cravings', label: 'Vontade incontrolável de doces/petiscos' },
                  { id: 'consistency', label: 'Manter a constância / desistência rápida' },
                  { id: 'cooking', label: 'Não saber ou não gostar de cozinhar' },
                  { id: 'eating_out', label: 'Eventos sociais e restaurantes' },
                  { id: 'lack_of_knowledge', label: 'Não saber o que comer ou combinar' },
                ].map((item) => {
                  const isSelected = (formData.primary_challenges || []).includes(item.id as NutritionChallenge);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        const current = formData.primary_challenges || [];
                        if (isSelected) {
                          setFormData({ ...formData, primary_challenges: current.filter((x) => x !== item.id) });
                        } else {
                          setFormData({ ...formData, primary_challenges: [...current, item.id as NutritionChallenge] });
                        }
                      }}
                      className={`p-2.5 rounded-xl border text-left text-xs font-medium transition-all ${
                        isSelected
                          ? 'bg-emerald-500/10 border-emerald-500 text-white'
                          : 'bg-neutral-950 border-neutral-800 text-neutral-400 hover:border-neutral-700'
                      }`}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ETAPA 8: REVISÃO & FINALIZAÇÃO */}
        {currentStep === 8 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                Etapa 8: Revisão e Finalização do Perfil
              </h2>
              <p className="text-xs text-neutral-400 mt-1">
                Revise suas informações antes de concluir. Você poderá salvar e atualizar seu perfil a qualquer momento.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-4 bg-neutral-950 border border-neutral-800 rounded-xl space-y-2">
                <div className="text-xs font-bold text-emerald-400 uppercase tracking-wider">
                  1. Medidas & Objetivo
                </div>
                <div className="text-xs text-neutral-300 space-y-1">
                  <div>Altura: <span className="text-white font-medium">{formData.height_cm || '—'} cm</span></div>
                  <div>Peso Atual: <span className="text-white font-medium">{formData.current_weight_kg || '—'} kg</span></div>
                  <div>Meta: <span className="text-white font-medium">{formData.primary_goal || 'Não informado'}</span></div>
                  <div>Sexo Biológico: <span className="text-white font-medium">{formData.biological_sex || '—'}</span></div>
                </div>
              </div>

              <div className="p-4 bg-neutral-950 border border-neutral-800 rounded-xl space-y-2">
                <div className="text-xs font-bold text-emerald-400 uppercase tracking-wider">
                  2. Rotina & Exercício
                </div>
                <div className="text-xs text-neutral-300 space-y-1">
                  <div>Acorda: <span className="text-white font-medium">{formData.wake_time || '—'}</span> | Dorme: <span className="text-white font-medium">{formData.sleep_time || '—'}</span></div>
                  <div>Sono: <span className="text-white font-medium">{formData.average_sleep_hours || '—'}h</span></div>
                  <div>Treinos: <span className="text-white font-medium">{formData.training_days_per_week || 0} dias/semana</span></div>
                  <div>Nível: <span className="text-white font-medium">{formData.activity_level || '—'}</span></div>
                </div>
              </div>

              <div className="p-4 bg-neutral-950 border border-neutral-800 rounded-xl space-y-2">
                <div className="text-xs font-bold text-emerald-400 uppercase tracking-wider">
                  3. Orçamento Alimentar
                </div>
                <div className="text-xs text-neutral-300 space-y-1">
                  <div>Valor: <span className="text-white font-medium">R$ {formData.food_budget_amount || 0} / {formData.food_budget_period}</span></div>
                  <div>Exclusivo p/ Paciente: <span className="text-white font-medium">{formData.is_budget_exclusive_for_patient ? 'Sim' : 'Não (Casa inteira)'}</span></div>
                  <div>Flexibilidade: <span className="text-white font-medium">{formData.budget_flexibility}</span></div>
                </div>
              </div>

              <div className="p-4 bg-neutral-950 border border-neutral-800 rounded-xl space-y-2">
                <div className="text-xs font-bold text-emerald-400 uppercase tracking-wider">
                  4. Preferências & Restrições
                </div>
                <div className="text-xs text-neutral-300 space-y-1">
                  <div>Padrão: <span className="text-white font-medium">{formData.dietary_pattern}</span></div>
                  <div>Recusas: <span className="text-rose-400 font-medium">{(formData.foods_patient_refuses || []).join(', ') || 'Nenhuma'}</span></div>
                  <div>Alergias: <span className="text-amber-400 font-medium">{(formData.food_allergies || []).join(', ') || 'Nenhuma'}</span></div>
                </div>
              </div>
            </div>

            <div className="p-5 bg-gradient-to-r from-emerald-950/40 via-neutral-900 to-neutral-900 border border-emerald-500/30 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 border border-emerald-500/30">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-sm font-bold text-white">Pronto para congelar a versão oficial?</div>
                  <div className="text-xs text-neutral-400">
                    Ao concluir, um snapshot histórico imutável (v{(initialProfile?.version || 1) + (initialProfile?.is_completed ? 1 : 0)}) será gerado para garantir conformidade clínica.
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={handleComplete}
                disabled={isPending}
                className="w-full sm:w-auto px-6 py-3 bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-bold rounded-xl text-sm transition-all shadow-lg shadow-emerald-500/20 disabled:opacity-50 shrink-0"
              >
                {isPending ? 'Gerando dieta e treino...' : 'Finalizar e Gerar Meus Planos'}
              </button>
            </div>
          </div>
        )}

        {/* Action Bottom Bar */}
        <div className="mt-8 pt-6 border-t border-neutral-800/80 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {currentStep > 1 && (
              <button
                type="button"
                onClick={handlePrev}
                disabled={isPending}
                className="px-4 py-2.5 rounded-xl border border-neutral-800 hover:bg-neutral-800 text-neutral-300 text-xs font-medium flex items-center gap-1.5 transition-colors disabled:opacity-50"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Voltar
              </button>
            )}

            <button
              type="button"
              onClick={() => saveCurrentStep(currentStep)}
              disabled={isPending}
              className="px-4 py-2.5 rounded-xl border border-neutral-800 hover:bg-neutral-800 text-neutral-400 hover:text-white text-xs font-medium flex items-center gap-1.5 transition-colors disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              {isPending ? 'Salvando...' : 'Salvar Rascunho'}
            </button>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/patient"
              className="px-4 py-2.5 rounded-xl text-neutral-400 hover:text-white text-xs font-medium transition-colors"
            >
              Continuar Depois
            </Link>

            {currentStep < 8 && (
              <button
                type="button"
                onClick={handleNext}
                disabled={isPending}
                className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-semibold text-xs flex items-center gap-1.5 transition-all shadow-md shadow-emerald-500/10 disabled:opacity-50"
              >
                {isPending ? 'Salvando...' : 'Salvar e Avançar'}
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
