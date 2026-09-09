// ==============================================================================
// ENGINE: MASTER DETERMINISTIC DIET COMPOSER ORCHESTRATOR
// ==============================================================================

import {
  DIET_COMPOSER_CONFIG_VERSION,
  DIET_COMPOSER_VERSION,
  COMPOSER_THRESHOLDS,
} from './config';
import {
  ComposerExecutionResult,
  ComposerInput,
  MealMacroTargets,
} from './types';
import { filterEligibleFoods } from './candidate-filter';
import { getMealTemplatesForCount } from './meal-templates';
import { VarietyTracker } from './variety';
import {
  checkAdherenceTolerances,
  composeDeterministicMeal,
  getPortionBoundary,
} from './solver';
import { evaluatePlanPricing } from './budget';
import {
  computeInputSnapshotHash,
  computeOutputPlanHash,
} from './hash';
import { DietPlan, DietPlanDay } from '@/types/diet-plan';

export class DietComposerSafetyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DietComposerSafetyError';
  }
}

/**
 * Ponto de entrada do Motor Determinístico de Dieta.
 * Transforma alvos nutricionais e restrições clínicas em um plano alimentar de 1 a 7 dias.
 */
export function runDietComposer(input: ComposerInput): ComposerExecutionResult {
  const dayCount = Math.max(
    COMPOSER_THRESHOLDS.MIN_DAYS_PER_PLAN,
    Math.min(COMPOSER_THRESHOLDS.MAX_DAYS_PER_PLAN, input.day_count ?? 7)
  );

  // 1. Validação de Alvos Nutricionais
  if (
    !input.targets ||
    input.targets.target_calories_nominal_kcal <= 0 ||
    input.targets.protein_g <= 0 ||
    input.targets.carbohydrate_g <= 0 ||
    input.targets.fat_g <= 0
  ) {
    return {
      success: false,
      generation_status: 'infeasible',
      infeasible_reason_codes: ['ENERGY_TARGET_UNREACHABLE'],
      error_message: 'Alvos calóricos ou de macronutrientes nulos ou negativos.',
    };
  }

  // 2. Filtragem e Tri-State de Segurança de Alimentos
  const { eligibleFoods, unknownAllergenCount } = filterEligibleFoods(
    input.food_catalog,
    input.constraints
  );

  if (eligibleFoods.length === 0) {
    const reasons: Array<'NO_ELIGIBLE_FOODS' | 'ALLERGEN_DATA_UNCERTAIN'> = ['NO_ELIGIBLE_FOODS'];
    if (unknownAllergenCount > 0) {
      reasons.push('ALLERGEN_DATA_UNCERTAIN');
    }
    return {
      success: false,
      generation_status: 'infeasible',
      infeasible_reason_codes: reasons,
      error_message: 'Nenhum alimento do catálogo é elegível e compatível com as restrições clínicas.',
    };
  }

  // Verificar existência de pelo menos uma fonte proteica
  const hasProtein = eligibleFoods.some((f) => f.role === 'protein' || f.role === 'dairy');
  if (!hasProtein) {
    return {
      success: false,
      generation_status: 'infeasible',
      infeasible_reason_codes: ['NO_COMPATIBLE_PROTEIN_SOURCE'],
      error_message: 'Nenhuma fonte de proteína elegível compatível com as restrições.',
    };
  }

  // 3. Estrutura de Refeições
  const desiredMeals = input.targets.desired_meals_per_day || 4;
  if (desiredMeals < 2 || desiredMeals > 8) {
    return {
      success: false,
      generation_status: 'infeasible',
      infeasible_reason_codes: ['INVALID_MEAL_COUNT'],
      error_message: `Número de refeições diárias (${desiredMeals}) inválido para composição automática.`,
    };
  }

  const mealTemplates = getMealTemplatesForCount(desiredMeals);
  const varietyTracker = new VarietyTracker();
  const generatedDays: DietPlanDay[] = [];

  const dailyTargetKcal = input.targets.target_calories_nominal_kcal;
  const dailyTargetProtein = input.targets.protein_g;
  const dailyTargetCarb = input.targets.carbohydrate_g;
  const dailyTargetFat = input.targets.fat_g;

  // 4. Composição de Cada Dia (1 a dayCount)
  for (let d = 1; d <= dayCount; d++) {
    const dayMeals = mealTemplates.map((template, idx) => {
      const mealTargets: MealMacroTargets = {
        calories_kcal: dailyTargetKcal * template.target_kcal_fraction,
        protein_g: dailyTargetProtein * template.target_protein_fraction,
        carbohydrate_g: dailyTargetCarb * template.target_carb_fraction,
        fat_g: dailyTargetFat * template.target_fat_fraction,
      };

      return composeDeterministicMeal(
        template,
        mealTargets,
        eligibleFoods,
        input.constraints,
        varietyTracker,
        d,
        idx + 1
      );
    });

    // Totais Brutos do Dia
    let dayKcal = 0;
    let dayProtein = 0;
    let dayCarb = 0;
    let dayFat = 0;
    let dayFiber = 0;
    let daySodium = 0;
    let dayCost = 0;

    for (const meal of dayMeals) {
      dayKcal += meal.actual_calories_kcal;
      dayProtein += meal.actual_protein_g;
      dayCarb += meal.actual_carbohydrate_g;
      dayFat += meal.actual_fat_g;
      dayFiber += meal.actual_fiber_g;
      daySodium += meal.actual_sodium_mg;
      if (meal.estimated_cost) dayCost += meal.estimated_cost;
    }

    // 5. Micro-Ajuste Fino de Fechamento Diário
    // 5.1 Ajuste de Proteína distribuído
    let remProtDelta = dailyTargetProtein - dayProtein;
    if (Math.abs(remProtDelta) > 4) {
      for (const m of dayMeals) {
        if (Math.abs(remProtDelta) <= 3) break;
        const mainProtItem = m.items.find((item) => {
          const f = eligibleFoods.find((ef) => ef.id === item.food_id);
          return f?.role === 'protein' || f?.role === 'dairy';
        });

        if (mainProtItem) {
          const f = eligibleFoods.find((ef) => ef.id === mainProtItem.food_id);
          if (f && f.protein_g_100g > 0) {
            const bounds = getPortionBoundary(f);
            const additionalGrams = Math.round((remProtDelta / f.protein_g_100g) * 100 / bounds.stepGrams) * bounds.stepGrams;
            const newGrams = Math.max(bounds.minGrams, Math.min(bounds.maxGrams, mainProtItem.grams + additionalGrams));

            if (newGrams !== mainProtItem.grams) {
              const gramsDiff = newGrams - mainProtItem.grams;
              mainProtItem.grams = newGrams;
              const itemKcalDiff = Number(((f.energy_kcal_100g * gramsDiff) / 100).toFixed(2));
              const itemProtDiff = Number(((f.protein_g_100g * gramsDiff) / 100).toFixed(2));
              const itemCarbDiff = Number(((f.carbohydrate_g_100g * gramsDiff) / 100).toFixed(2));
              const itemFatDiff = Number(((f.fat_g_100g * gramsDiff) / 100).toFixed(2));

              mainProtItem.energy_kcal = Number((mainProtItem.energy_kcal + itemKcalDiff).toFixed(2));
              mainProtItem.protein_g = Number((mainProtItem.protein_g + itemProtDiff).toFixed(2));
              mainProtItem.carbohydrate_g = Number((mainProtItem.carbohydrate_g + itemCarbDiff).toFixed(2));
              mainProtItem.fat_g = Number((mainProtItem.fat_g + itemFatDiff).toFixed(2));

              m.actual_calories_kcal = Number((m.actual_calories_kcal + itemKcalDiff).toFixed(2));
              m.actual_protein_g = Number((m.actual_protein_g + itemProtDiff).toFixed(2));
              m.actual_carbohydrate_g = Number((m.actual_carbohydrate_g + itemCarbDiff).toFixed(2));
              m.actual_fat_g = Number((m.actual_fat_g + itemFatDiff).toFixed(2));

              dayKcal += itemKcalDiff;
              dayProtein += itemProtDiff;
              dayCarb += itemCarbDiff;
              dayFat += itemFatDiff;
              remProtDelta -= itemProtDiff;
            }
          }
        }
      }
    }

    // 5.2 Ajuste de Gordura distribuído
    let remFatDelta = dailyTargetFat - dayFat;
    if (Math.abs(remFatDelta) > 5) {
      for (const m of dayMeals) {
        if (Math.abs(remFatDelta) <= 4) break;
        const lipItem = m.items.find((item) => {
          const f = eligibleFoods.find((ef) => ef.id === item.food_id);
          return f?.role === 'lipid';
        });

        if (lipItem) {
          const f = eligibleFoods.find((ef) => ef.id === lipItem.food_id);
          if (f && f.fat_g_100g > 50) {
            const bounds = getPortionBoundary(f);
            const additionalGrams = Math.round((remFatDelta / (f.fat_g_100g / 100)) / bounds.stepGrams) * bounds.stepGrams;
            const newGrams = Math.max(bounds.minGrams, Math.min(bounds.maxGrams, lipItem.grams + additionalGrams));

            if (newGrams !== lipItem.grams) {
              const gramsDiff = newGrams - lipItem.grams;
              lipItem.grams = newGrams;
              const itemKcalDiff = Number(((f.energy_kcal_100g * gramsDiff) / 100).toFixed(2));
              const itemFatDiff = Number(((f.fat_g_100g * gramsDiff) / 100).toFixed(2));

              lipItem.energy_kcal = Number((lipItem.energy_kcal + itemKcalDiff).toFixed(2));
              lipItem.fat_g = Number((lipItem.fat_g + itemFatDiff).toFixed(2));

              m.actual_calories_kcal = Number((m.actual_calories_kcal + itemKcalDiff).toFixed(2));
              m.actual_fat_g = Number((m.actual_fat_g + itemFatDiff).toFixed(2));

              dayKcal += itemKcalDiff;
              dayFat += itemFatDiff;
              remFatDelta -= itemFatDiff;
            }
          }
        }
      }
    }

    // 5.3 Ajuste de Carboidrato distribuído
    let remCarbDelta = dailyTargetCarb - dayCarb;
    if (Math.abs(remCarbDelta) > 8) {
      for (const m of dayMeals) {
        if (Math.abs(remCarbDelta) <= 6) break;
        const carbItem = m.items.find((item) => {
          const f = eligibleFoods.find((ef) => ef.id === item.food_id);
          return f?.role === 'carb' || f?.role === 'legume';
        });

        if (carbItem) {
          const f = eligibleFoods.find((ef) => ef.id === carbItem.food_id);
          if (f && f.carbohydrate_g_100g > 12) {
            const bounds = getPortionBoundary(f);
            const additionalGrams = Math.round((remCarbDelta / (f.carbohydrate_g_100g / 100)) / bounds.stepGrams) * bounds.stepGrams;
            const newGrams = Math.max(bounds.minGrams, Math.min(bounds.maxGrams, carbItem.grams + additionalGrams));

            if (newGrams !== carbItem.grams) {
              const gramsDiff = newGrams - carbItem.grams;
              carbItem.grams = newGrams;
              const itemKcalDiff = Number(((f.energy_kcal_100g * gramsDiff) / 100).toFixed(2));
              const itemCarbDiff = Number(((f.carbohydrate_g_100g * gramsDiff) / 100).toFixed(2));

              carbItem.energy_kcal = Number((carbItem.energy_kcal + itemKcalDiff).toFixed(2));
              carbItem.carbohydrate_g = Number((carbItem.carbohydrate_g + itemCarbDiff).toFixed(2));

              m.actual_calories_kcal = Number((m.actual_calories_kcal + itemKcalDiff).toFixed(2));
              m.actual_carbohydrate_g = Number((m.actual_carbohydrate_g + itemCarbDiff).toFixed(2));

              dayKcal += itemKcalDiff;
              dayCarb += itemCarbDiff;
              remCarbDelta -= itemCarbDiff;
            }
          }
        }
      }
    }

    // 5.4 Micro-Ajuste Fino de Fechamento Calórico
    let remKcalDelta = dailyTargetKcal - dayKcal;
    if (remKcalDelta > 60) {
      for (const m of dayMeals) {
        if (remKcalDelta <= 40) break;
        const grainItem = m.items.find((item) => {
          const f = eligibleFoods.find((ef) => ef.id === item.food_id);
          return f?.role === 'carb';
        });
        if (grainItem) {
          const f = eligibleFoods.find((ef) => ef.id === grainItem.food_id);
          if (f && f.energy_kcal_100g > 50) {
            const bounds = getPortionBoundary(f);
            if (grainItem.grams + bounds.stepGrams <= bounds.maxGrams) {
              grainItem.grams += bounds.stepGrams;
              const addKcal = Number(((f.energy_kcal_100g * bounds.stepGrams) / 100).toFixed(2));
              const addCarb = Number(((f.carbohydrate_g_100g * bounds.stepGrams) / 100).toFixed(2));
              const addProt = Number(((f.protein_g_100g * bounds.stepGrams) / 100).toFixed(2));
              grainItem.energy_kcal = Number((grainItem.energy_kcal + addKcal).toFixed(2));
              grainItem.carbohydrate_g = Number((grainItem.carbohydrate_g + addCarb).toFixed(2));
              grainItem.protein_g = Number((grainItem.protein_g + addProt).toFixed(2));
              m.actual_calories_kcal = Number((m.actual_calories_kcal + addKcal).toFixed(2));
              m.actual_carbohydrate_g = Number((m.actual_carbohydrate_g + addCarb).toFixed(2));
              m.actual_protein_g = Number((m.actual_protein_g + addProt).toFixed(2));
              dayKcal += addKcal;
              dayCarb += addCarb;
              dayProtein += addProt;
              remKcalDelta -= addKcal;
            }
          }
        }
      }
    }

    // Avaliação de tolerância diária
    const dayAdherence = checkAdherenceTolerances(
      {
        calories_kcal: dailyTargetKcal,
        protein_g: dailyTargetProtein,
        carbohydrate_g: dailyTargetCarb,
        fat_g: dailyTargetFat,
      },
      {
        calories_kcal: dayKcal,
        protein_g: dayProtein,
        carbohydrate_g: dayCarb,
        fat_g: dayFat,
      }
    );

    const calDeltaPct = Number((((dayKcal - dailyTargetKcal) / dailyTargetKcal) * 100).toFixed(2));
    const protDeltaPct = Number((((dayProtein - dailyTargetProtein) / dailyTargetProtein) * 100).toFixed(2));
    const carbDeltaPct = Number((((dayCarb - dailyTargetCarb) / dailyTargetCarb) * 100).toFixed(2));
    const fatDeltaPct = Number((((dayFat - dailyTargetFat) / dailyTargetFat) * 100).toFixed(2));

    const dayLabels = ['Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado', 'Domingo'];

    const planDay: DietPlanDay = {
      day_of_week: d,
      day_label: dayLabels[d - 1] || `Dia ${d}`,
      target_calories_kcal: Number(dailyTargetKcal.toFixed(2)),
      target_protein_g: Number(dailyTargetProtein.toFixed(2)),
      target_carbohydrate_g: Number(dailyTargetCarb.toFixed(2)),
      target_fat_g: Number(dailyTargetFat.toFixed(2)),
      actual_calories_kcal: Number(dayKcal.toFixed(2)),
      actual_protein_g: Number(dayProtein.toFixed(2)),
      actual_carbohydrate_g: Number(dayCarb.toFixed(2)),
      actual_fat_g: Number(dayFat.toFixed(2)),
      actual_fiber_g: Number(dayFiber.toFixed(2)),
      actual_sodium_mg: Number(daySodium.toFixed(2)),
      calories_delta_pct: calDeltaPct,
      protein_delta_pct: protDeltaPct,
      carbohydrate_delta_pct: carbDeltaPct,
      fat_delta_pct: fatDeltaPct,
      adherence_status: dayAdherence.overall_status,
      estimated_cost: dayCost > 0 ? Number(dayCost.toFixed(2)) : null,
      meals: dayMeals,
    };

    generatedDays.push(planDay);

    // Registrar no rastreador de variedade
    varietyTracker.recordDayUsage(d, dayMeals);
  }

  // 6. Verificar se algum dia falhou nas tolerâncias
  const hasInfeasibleDays = generatedDays.some((day) => day.adherence_status === 'out_of_tolerance');
  if (hasInfeasibleDays) {
    return {
      success: false,
      generation_status: 'infeasible',
      infeasible_reason_codes: ['MACRO_TARGET_UNREACHABLE'],
      error_message: 'Não foi possível compor as refeições diárias dentro das tolerâncias configuradas.',
    };
  }

  // 7. Avaliação de Orçamento
  const generationReferenceAt = input.generation_reference_at || '2026-09-08T00:00:00.000Z';
  const allDay1Items = generatedDays[0].meals.flatMap((m) => m.items);
  const pricingEval = evaluatePlanPricing(
    allDay1Items,
    input.targets.normalized_daily_budget,
    dayCount,
    input.currency || input.targets.currency || 'BRL'
  );

  // Se o orçamento for HARD e uma solução dentro dele for impossível -> infeasible/BUDGET_INSUFFICIENT
  if (input.is_budget_hard && pricingEval.budget_status === 'exceeds_budget') {
    return {
      success: false,
      generation_status: 'infeasible',
      infeasible_reason_codes: ['BUDGET_INSUFFICIENT'],
      error_message: 'Custo diário estimado excede o orçamento estrito (HARD budget) configurado para o paciente.',
    };
  }

  // 8. Hashes Determinísticos
  const eligibleFoodIds = eligibleFoods.map((f) => f.id);
  const inputSnapshotHash = computeInputSnapshotHash({
    patient_id: input.patient_id,
    targets: input.targets,
    constraints: input.constraints,
    eligible_food_ids: eligibleFoodIds,
    composer_version: DIET_COMPOSER_VERSION,
    composer_config_version: DIET_COMPOSER_CONFIG_VERSION,
    food_dataset_checksum: input.food_dataset_checksum,
    generation_reference_at: generationReferenceAt,
  });

  const outputPlanHash = computeOutputPlanHash(generatedDays);

  // 9. Status Clínico e Ciclo de Vida Formalizado
  // - calculated seguro -> publicação automática (approved, is_active: true)
  // - review_required -> draft estritamente invisível ao paciente (draft, is_active: false)
  const generationStatus = input.requires_review ? 'review_required' : 'calculated';
  const isAutoApproved = generationStatus === 'calculated';

  const plan: DietPlan = {
    id: '', // Atribuído no persist do banco
    patient_id: input.patient_id,
    source_nutrition_engine_run_id: input.engine_run_id,
    source_nutrition_target_id: input.nutrition_target_id,
    composer_version: DIET_COMPOSER_VERSION,
    composer_config_version: DIET_COMPOSER_CONFIG_VERSION,
    food_dataset_version: input.food_dataset_version,
    food_dataset_checksum: input.food_dataset_checksum,
    price_engine_version: input.price_engine_version,
    generation_reference_at: generationReferenceAt,
    input_snapshot_hash: inputSnapshotHash,
    output_plan_hash: outputPlanHash,
    generation_status: generationStatus,
    approval_status: isAutoApproved ? 'approved' : 'draft',
    rejection_reason: null,
    infeasible_reason_codes: [],
    day_count: dayCount,
    daily_budget_target: input.targets.normalized_daily_budget > 0 ? input.targets.normalized_daily_budget : null,
    estimated_daily_cost: pricingEval.estimated_daily_cost,
    estimated_weekly_cost: pricingEval.estimated_weekly_cost,
    budget_confidence: pricingEval.budget_confidence,
    budget_status: pricingEval.budget_status,
    currency: pricingEval.currency,
    price_coverage_percentage: pricingEval.price_coverage_percentage,
    version: 1,
    superseded_by: null,
    is_active: isAutoApproved,
    created_by: null,
    approved_by: isAutoApproved ? 'system:auto_publish' : null,
    approved_at: isAutoApproved ? generationReferenceAt : null,
    created_at: generationReferenceAt,
    updated_at: generationReferenceAt,
    days: generatedDays,
  };

  const finalAdherence = checkAdherenceTolerances(
    {
      calories_kcal: dailyTargetKcal,
      protein_g: dailyTargetProtein,
      carbohydrate_g: dailyTargetCarb,
      fat_g: dailyTargetFat,
    },
    {
      calories_kcal: generatedDays[0].actual_calories_kcal,
      protein_g: generatedDays[0].actual_protein_g,
      carbohydrate_g: generatedDays[0].actual_carbohydrate_g,
      fat_g: generatedDays[0].actual_fat_g,
    }
  );

  return {
    success: true,
    plan,
    generation_status: generationStatus,
    infeasible_reason_codes: [],
    adherence: finalAdherence,
  };
}
