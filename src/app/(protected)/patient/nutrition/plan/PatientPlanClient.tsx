'use client';

import React, { useState } from 'react';
import {
  DietPlan,
  DietPlanDay,
  DietMealItemSnapshot,
  FoodSubstitutionOption,
} from '@/types/diet-plan';
import {
  getSubstitutionOptionsAction,
  applySubstitutionAction,
} from '@/app/actions/diet-plan';
import {
  Calendar,
  Utensils,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Flame,
  Dumbbell,
  Wheat,
  Droplet,
  DollarSign,
  Info,
} from 'lucide-react';

interface Props {
  initialPlan: DietPlan | null;
  patientId: string;
}

export function PatientPlanClient({ initialPlan }: Props) {
  const [plan] = useState<DietPlan | null>(initialPlan);
  const [selectedDayIndex, setSelectedDayIndex] = useState<number>(0);
  const [substitutingItem, setSubstitutingItem] = useState<DietMealItemSnapshot | null>(null);
  const [substitutionOptions, setSubstitutionOptions] = useState<FoodSubstitutionOption[]>([]);
  const [isLoadingOptions, setIsLoadingOptions] = useState<boolean>(false);
  const [isApplying, setIsApplying] = useState<boolean>(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  if (!plan) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center max-w-2xl mx-auto">
        <Utensils className="w-12 h-12 text-gray-300 mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-gray-800 mb-2">Nenhum plano alimentar ativo</h2>
        <p className="text-gray-500 mb-6">
          Seu plano alimentar ainda não foi gerado ou está aguardando revisão clínica de sua nutricionista.
        </p>
      </div>
    );
  }

  const currentDay: DietPlanDay | undefined = plan.days[selectedDayIndex];

  async function handleOpenSubstitution(item: DietMealItemSnapshot) {
    if (!item.id || !plan?.id) return;
    setSubstitutingItem(item);
    setIsLoadingOptions(true);
    setMessage(null);

    const res = await getSubstitutionOptionsAction(plan.id, item.id);
    setIsLoadingOptions(false);
    if (res.success && res.data) {
      setSubstitutionOptions(res.data);
    } else {
      setMessage({ text: res.error || 'Erro ao carregar opções de troca.', type: 'error' });
    }
  }

  async function handleApplySubstitution(option: FoodSubstitutionOption) {
    if (!substitutingItem?.id || !plan?.id) return;
    setIsApplying(true);

    const res = await applySubstitutionAction(
      plan.id,
      substitutingItem.id,
      option.food_id,
      option.suggested_grams
    );

    setIsApplying(false);
    if (res.success) {
      setMessage({ text: `Alimento substituído com sucesso por ${option.food_name}!`, type: 'success' });
      setSubstitutingItem(null);
      // Recarrega visualmente o plano
      window.location.reload();
    } else {
      setMessage({ text: res.error || 'Falha ao aplicar substituição.', type: 'error' });
    }
  }

  return (
    <div className="space-y-6">
      {/* Header com Status do Plano */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">Meu Plano Alimentar</h1>
            {plan.approval_status === 'approved' ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                <CheckCircle2 className="w-3.5 h-3.5" /> Plano liberado
              </span>
            ) : plan.generation_status === 'review_required' ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
                <AlertTriangle className="w-3.5 h-3.5" /> Aguardando Revisão Profissional
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
                <CheckCircle2 className="w-3.5 h-3.5" /> Calculado pelo Motor Nutricional
              </span>
            )}
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Plano estruturado em gramas canônicas • Versão do Composer: {plan.composer_version}
          </p>
        </div>

        {/* Orçamento Resumo */}
        <div className="flex items-center gap-4 bg-gray-50 px-4 py-2.5 rounded-lg border border-gray-200 text-sm">
          <div className="flex items-center gap-1.5 text-gray-700">
            <DollarSign className="w-4 h-4 text-emerald-600" />
            <span className="font-semibold">
              {plan.estimated_daily_cost ? `R$ ${plan.estimated_daily_cost.toFixed(2)}/dia` : 'Sem estimativa de custo'}
            </span>
          </div>
          <span className="text-gray-300">|</span>
          <span className="text-xs text-gray-500">
            {plan.budget_status === 'within_budget'
              ? '✓ Dentro do Orçamento'
              : plan.budget_status === 'exceeds_budget'
              ? '⚠ Excede Orçamento'
              : 'Orçamento não verificado'}
          </span>
        </div>
      </div>

      {message && (
        <div
          className={`p-4 rounded-lg text-sm flex items-center gap-2 ${
            message.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-red-50 text-red-800 border border-red-200'
          }`}
        >
          <Info className="w-4 h-4" />
          {message.text}
        </div>
      )}

      {/* Seletor de Dias (1 a 7) */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-gray-200">
        {plan.days.map((day, idx) => (
          <button
            key={day.day_of_week}
            onClick={() => setSelectedDayIndex(idx)}
            className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all flex items-center gap-2 ${
              selectedDayIndex === idx
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            {day.day_label}
          </button>
        ))}
      </div>

      {/* Resumo Nutricional do Dia Selecionado */}
      {currentDay && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-orange-50 text-orange-600 flex items-center justify-center">
              <Flame className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-gray-500">Calorias</p>
              <p className="text-lg font-bold text-gray-900">{currentDay.actual_calories_kcal} kcal</p>
              <p className="text-xs text-gray-400">Meta: {currentDay.target_calories_kcal} kcal</p>
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <Dumbbell className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-gray-500">Proteínas</p>
              <p className="text-lg font-bold text-gray-900">{currentDay.actual_protein_g}g</p>
              <p className="text-xs text-gray-400">Meta: {currentDay.target_protein_g}g</p>
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
              <Wheat className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-gray-500">Carboidratos</p>
              <p className="text-lg font-bold text-gray-900">{currentDay.actual_carbohydrate_g}g</p>
              <p className="text-xs text-gray-400">Meta: {currentDay.target_carbohydrate_g}g</p>
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
              <Droplet className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-gray-500">Gorduras</p>
              <p className="text-lg font-bold text-gray-900">{currentDay.actual_fat_g}g</p>
              <p className="text-xs text-gray-400">Meta: {currentDay.target_fat_g}g</p>
            </div>
          </div>
        </div>
      )}

      {/* Lista de Refeições do Dia */}
      {currentDay && (
        <div className="space-y-6">
          {currentDay.meals.map((meal) => (
            <div key={meal.meal_order} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="bg-gray-50/80 px-4 sm:px-6 py-4 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <h3 className="font-semibold text-gray-900">{meal.meal_name}</h3>
                  <span className="text-xs text-gray-500">
                    Horário sugerido: {meal.scheduled_time || 'Flexível'} • {meal.actual_calories_kcal} kcal
                  </span>
                </div>
                <div className="text-xs text-gray-500 font-medium">
                  {meal.actual_protein_g}g P • {meal.actual_carbohydrate_g}g C • {meal.actual_fat_g}g G
                </div>
              </div>

              <div className="divide-y divide-gray-100">
                {meal.items.map((item) => (
                  <div key={item.item_order} className="p-4 sm:px-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 hover:bg-gray-50/50 transition-colors">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900">{item.food_name}</span>
                        {item.household_measure_label && (
                          <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600 border border-gray-200">
                            ≈ {item.household_measure_quantity} {item.household_measure_label}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-500 mt-1 flex items-center gap-3">
                        <span className="font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                          {item.grams}g
                        </span>
                        <span>{item.energy_kcal} kcal</span>
                        <span>P: {item.protein_g}g</span>
                        <span>C: {item.carbohydrate_g}g</span>
                        <span>G: {item.fat_g}g</span>
                        {item.price_estimate && <span>R$ {item.price_estimate.toFixed(2)}</span>}
                      </div>
                    </div>

                    <button
                      onClick={() => handleOpenSubstitution(item)}
                      className="self-start sm:self-auto inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600 hover:text-emerald-700 bg-emerald-50 hover:bg-emerald-100/70 px-3 py-1.5 rounded-lg transition-colors"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      Trocar
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal de Troca Inteligente */}
      {substitutingItem && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-xl w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <h3 className="font-bold text-gray-900 text-lg">Troca Inteligente</h3>
                <p className="text-xs text-gray-500">
                  Substituir: <span className="font-semibold text-gray-700">{substitutingItem.food_name}</span> ({substitutingItem.grams}g)
                </p>
              </div>
              <button
                onClick={() => setSubstitutingItem(null)}
                className="text-gray-400 hover:text-gray-600 text-sm font-semibold"
              >
                ✕
              </button>
            </div>

            {isLoadingOptions ? (
              <div className="py-8 text-center text-gray-500 text-sm flex items-center justify-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin" /> Calculando alternativas determinísticas seguras...
              </div>
            ) : substitutionOptions.length === 0 ? (
              <p className="py-6 text-center text-sm text-gray-500">
                Nenhum alimento substituto seguro encontrado para suas restrições e alergias.
              </p>
            ) : (
              <div className="space-y-3">
                {substitutionOptions.map((opt) => (
                  <div
                    key={opt.food_id}
                    className="p-4 rounded-xl border border-gray-200 hover:border-emerald-500 bg-white transition-all space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-gray-900">{opt.food_name}</span>
                      <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                        {opt.suggested_grams}g
                      </span>
                    </div>

                    <div className="text-xs text-gray-600 flex flex-wrap items-center gap-2">
                      <span>{opt.energy_kcal} kcal (Δ {opt.nutrition_delta.delta_kcal > 0 ? `+${opt.nutrition_delta.delta_kcal}` : opt.nutrition_delta.delta_kcal})</span>
                      <span>•</span>
                      <span>P: {opt.protein_g}g</span>
                      <span>•</span>
                      <span>C: {opt.carbohydrate_g}g</span>
                      <span>•</span>
                      <span>G: {opt.fat_g}g</span>
                      {opt.cost_delta !== null && (
                        <>
                          <span>•</span>
                          <span className={opt.cost_delta <= 0 ? 'text-emerald-600 font-medium' : 'text-gray-500'}>
                            {opt.cost_delta <= 0 ? `Economia: R$ ${Math.abs(opt.cost_delta).toFixed(2)}` : `+ R$ ${opt.cost_delta.toFixed(2)}`}
                          </span>
                        </>
                      )}
                    </div>

                    <div className="flex items-center justify-between pt-2">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {opt.reason_codes.map((rc) => (
                          <span key={rc} className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded font-medium">
                            {rc}
                          </span>
                        ))}
                      </div>

                      <button
                        disabled={isApplying}
                        onClick={() => handleApplySubstitution(opt)}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-medium transition-colors"
                      >
                        {isApplying ? 'Aplicando...' : 'Confirmar Troca'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
