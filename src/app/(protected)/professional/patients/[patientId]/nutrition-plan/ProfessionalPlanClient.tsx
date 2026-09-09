'use client';

import React, { useState } from 'react';
import { DietPlan, DietPlanDay } from '@/types/diet-plan';
import {
  generateDietPlanAction,
  reviewDietPlanAction,
} from '@/app/actions/diet-plan';
import {
  CheckCircle2,
  XCircle,
  RefreshCw,
  Calendar,
  AlertTriangle,
  Flame,
  Dumbbell,
  Wheat,
  Droplet,
  Info,
} from 'lucide-react';

interface Props {
  initialPlan: DietPlan | null;
  patientId: string;
}

export function ProfessionalPlanClient({ initialPlan, patientId }: Props) {
  const [plan] = useState<DietPlan | null>(initialPlan);
  const [selectedDayIndex, setSelectedDayIndex] = useState<number>(0);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  async function handleGeneratePlan() {
    setIsProcessing(true);
    setMessage(null);

    const res = await generateDietPlanAction(patientId, 7);
    setIsProcessing(false);

    if (res.success) {
      setMessage({ text: 'Plano alimentar gerado com sucesso pelo motor determinístico!', type: 'success' });
      window.location.reload();
    } else {
      setMessage({ text: res.error || 'Erro ao compor plano.', type: 'error' });
    }
  }

  async function handleReviewPlan(decision: 'approved' | 'rejected') {
    if (!plan?.id) return;
    setIsProcessing(true);
    setMessage(null);

    const res = await reviewDietPlanAction(plan.id, decision);
    setIsProcessing(false);

    if (res.success) {
      setMessage({
        text: decision === 'approved' ? 'Plano clínico aprovado com sucesso!' : 'Plano rejeitado.',
        type: 'success',
      });
      window.location.reload();
    } else {
      setMessage({ text: res.error || 'Falha ao atualizar status.', type: 'error' });
    }
  }

  const currentDay: DietPlanDay | undefined = plan?.days[selectedDayIndex];

  return (
    <div className="space-y-6">
      {/* Header com Ações Clínicas */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">Plano Alimentar Clínico</h1>
            {plan?.approval_status === 'approved' ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                <CheckCircle2 className="w-3.5 h-3.5" /> Aprovado
              </span>
            ) : plan?.generation_status === 'review_required' ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
                <AlertTriangle className="w-3.5 h-3.5" /> Requer Revisão da Nutricionista
              </span>
            ) : plan ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
                <Info className="w-3.5 h-3.5" /> Draft Calculado
              </span>
            ) : (
              <span className="text-xs text-gray-500">Sem plano gerado</span>
            )}
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Revisão profissional e governança clínica do paciente
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <button
            disabled={isProcessing}
            onClick={handleGeneratePlan}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${isProcessing ? 'animate-spin' : ''}`} />
            {plan ? 'Regenerar Plano' : 'Gerar Plano Determinístico'}
          </button>

          {plan && plan.approval_status !== 'approved' && (
            <>
              <button
                disabled={isProcessing}
                onClick={() => handleReviewPlan('rejected')}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 text-sm font-medium transition-colors"
              >
                <XCircle className="w-4 h-4" /> Rejeitar
              </button>
              <button
                disabled={isProcessing}
                onClick={() => handleReviewPlan('approved')}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium transition-colors"
              >
                <CheckCircle2 className="w-4 h-4" /> Aprovar e Ativar Plano
              </button>
            </>
          )}
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

      {/* Seletor de Dias */}
      {plan && plan.days.length > 0 && (
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
      )}

      {/* Relatório Clínico de Desvios */}
      {currentDay && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
            <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
              <Flame className="w-4 h-4 text-orange-500" /> Calorias (Δ {currentDay.calories_delta_pct}%)
            </div>
            <p className="text-xl font-bold text-gray-900">{currentDay.actual_calories_kcal} kcal</p>
            <p className="text-xs text-gray-400">Meta: {currentDay.target_calories_kcal} kcal</p>
          </div>

          <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
            <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
              <Dumbbell className="w-4 h-4 text-blue-500" /> Proteínas (Δ {currentDay.protein_delta_pct}%)
            </div>
            <p className="text-xl font-bold text-gray-900">{currentDay.actual_protein_g}g</p>
            <p className="text-xs text-gray-400">Meta: {currentDay.target_protein_g}g</p>
          </div>

          <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
            <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
              <Wheat className="w-4 h-4 text-amber-500" /> Carboidratos (Δ {currentDay.carbohydrate_delta_pct}%)
            </div>
            <p className="text-xl font-bold text-gray-900">{currentDay.actual_carbohydrate_g}g</p>
            <p className="text-xs text-gray-400">Meta: {currentDay.target_carbohydrate_g}g</p>
          </div>

          <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
            <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
              <Droplet className="w-4 h-4 text-purple-500" /> Gorduras (Δ {currentDay.fat_delta_pct}%)
            </div>
            <p className="text-xl font-bold text-gray-900">{currentDay.actual_fat_g}g</p>
            <p className="text-xs text-gray-400">Meta: {currentDay.target_fat_g}g</p>
          </div>
        </div>
      )}

      {/* Refeições e Alimentos */}
      {currentDay && (
        <div className="space-y-4">
          {currentDay.meals.map((meal) => (
            <div key={meal.meal_order} className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 space-y-3">
              <div className="flex items-center justify-between border-b pb-2">
                <div>
                  <h3 className="font-semibold text-gray-900">{meal.meal_name}</h3>
                  <span className="text-xs text-gray-400">Horário: {meal.scheduled_time || 'Flexível'}</span>
                </div>
                <div className="text-xs font-semibold text-gray-700">
                  {meal.actual_calories_kcal} kcal • P: {meal.actual_protein_g}g • C: {meal.actual_carbohydrate_g}g • G: {meal.actual_fat_g}g
                </div>
              </div>

              <div className="space-y-2">
                {meal.items.map((item) => (
                  <div key={item.item_order} className="flex items-center justify-between text-sm py-1 border-b border-gray-50">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-800">{item.food_name}</span>
                      <span className="text-xs px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 font-bold">
                        {item.grams}g
                      </span>
                      {item.household_measure_label && (
                        <span className="text-xs text-gray-400">
                          (≈ {item.household_measure_quantity} {item.household_measure_label})
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500 flex items-center gap-3">
                      <span>{item.energy_kcal} kcal</span>
                      <span>P: {item.protein_g}g</span>
                      <span>C: {item.carbohydrate_g}g</span>
                      <span>G: {item.fat_g}g</span>
                      {item.price_estimate && <span>R$ {item.price_estimate.toFixed(2)}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
