import React from 'react';
import Link from 'next/link';
import { requireRole } from '@/lib/auth/guards';
import { searchFoodsAction, getFoodDetailsAction } from '@/app/actions/foods';
import { calculatePortionNutrition } from '@/lib/foods/nutrition';
import { calculateEconomicNutritionalMetrics } from '@/lib/foods/pricing';
import { BaseNutrientInfo } from '@/lib/foods/nutrition';
import { Database, Search, ArrowLeft, Scale } from 'lucide-react';

interface ProfessionalFoodsPageProps {
  searchParams: Promise<{
    q?: string;
    group?: string;
    selectedId?: string;
    grams?: string;
  }>;
}

export default async function ProfessionalFoodsPage({ searchParams }: ProfessionalFoodsPageProps) {
  await requireRole(['nutritionist', 'admin']);
  const params = await searchParams;

  const searchQuery = params.q || '';
  const selectedGroup = params.group || '';
  const selectedId = params.selectedId || '';
  const portionGrams = parseFloat(params.grams || '100') || 100;

  const searchResult = await searchFoodsAction({
    query: searchQuery,
    foodGroup: selectedGroup || undefined,
    limit: 30,
  });

  const foods = searchResult.data?.foods || [];
  const activeFoodId = selectedId || (foods.length > 0 ? foods[0].id : null);

  let selectedFoodDetails = null;
  let portionNutrition = null;
  let economicMetrics = null;

  if (activeFoodId) {
    const detailsRes = await getFoodDetailsAction(activeFoodId);
    if (detailsRes.success && detailsRes.data) {
      selectedFoodDetails = detailsRes.data.food;
      const priceEst = detailsRes.data.priceEstimate;

      // Monta mapa base para porção
      const baseMap: Record<string, BaseNutrientInfo> = {};
      if (selectedFoodDetails.nutrients) {
        for (const [k, n] of Object.entries(selectedFoodDetails.nutrients)) {
          baseMap[k] = {
            code: n.nutrient_code,
            name: n.nutrient_name,
            unit: n.unit,
            amount_per_100g: n.amount_per_100g,
            data_quality: n.data_quality,
          };
        }
      }

      // Calcula custo de porção
      let portionCost = null;
      if (priceEst.estimated_price_per_kg) {
        portionCost = Math.round(((priceEst.estimated_price_per_kg / 1000) * portionGrams) * 100) / 100;
      }

      portionNutrition = calculatePortionNutrition(
        selectedFoodDetails.id,
        selectedFoodDetails.name,
        baseMap,
        portionGrams,
        null,
        portionCost
      );

      const energyVal = baseMap.energy_kcal?.amount_per_100g ?? null;
      const proteinVal = baseMap.protein_g?.amount_per_100g ?? null;

      economicMetrics = calculateEconomicNutritionalMetrics(
        selectedFoodDetails.id,
        priceEst.estimated_price_per_kg,
        energyVal,
        proteinVal
      );
    }
  }

  const foodGroups = [
    'Cereais e derivados',
    'Verduras, hortaliças e derivados',
    'Frutas e derivados',
    'Leguminosas e derivados',
    'Nozes e sementes',
    'Carnes e derivados',
    'Pescados e frutos do mar',
    'Leite e derivados',
    'Ovos e derivados',
    'Óleos e gorduras',
  ];

  return (
    <div className="flex-1 max-w-7xl w-full mx-auto px-4 py-8 sm:px-6 lg:px-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-5">
        <div>
          <div className="flex items-center space-x-2 text-xs font-semibold text-emerald-400 uppercase tracking-wider mb-1">
            <Database className="w-4 h-4" />
            <span>Consulta Clínica de Alimentos (Nutricionista)</span>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Tabela de Composição & Custo Nutricional</h1>
          <p className="text-xs text-zinc-400 mt-0.5">
            Pesquise alimentos oficiais da TACO 4ª edição, simule gramaturas personalizadas e avalie eficiência de custo.
          </p>
        </div>

        <Link
          href="/professional"
          className="inline-flex items-center space-x-1.5 text-xs text-zinc-400 hover:text-white border border-zinc-800 bg-zinc-900 px-3 py-2 rounded-lg transition-colors self-start"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Voltar ao Portal</span>
        </Link>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Food Search & List */}
        <div className="lg:col-span-5 space-y-4">
          <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/50 space-y-3">
            <form method="GET" className="space-y-3">
              <div className="relative">
                <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  name="q"
                  defaultValue={searchQuery}
                  placeholder="Pesquisar alimento..."
                  className="w-full pl-9 pr-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex space-x-2">
                <select
                  name="group"
                  defaultValue={selectedGroup}
                  className="flex-1 px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-200 focus:outline-none focus:border-emerald-500"
                >
                  <option value="">Todos os Grupos</option>
                  {foodGroups.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
                <button
                  type="submit"
                  className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors cursor-pointer"
                >
                  Filtrar
                </button>
              </div>
            </form>
          </div>

          {/* Foods list */}
          <div className="border border-zinc-800 rounded-xl overflow-hidden bg-zinc-900/30 max-h-[600px] overflow-y-auto divide-y divide-zinc-800/60">
            {foods.length === 0 ? (
              <div className="p-6 text-center text-xs text-zinc-500">
                Nenhum alimento encontrado. Tente outros termos de busca.
              </div>
            ) : (
              foods.map((food) => {
                const isSelected = food.id === activeFoodId;
                return (
                  <Link
                    key={food.id}
                    href={`/professional/foods?q=${encodeURIComponent(searchQuery)}&group=${encodeURIComponent(
                      selectedGroup
                    )}&selectedId=${food.id}&grams=${portionGrams}`}
                    className={`block p-3.5 transition-colors ${
                      isSelected
                        ? 'bg-emerald-950/30 border-l-2 border-emerald-500 text-white'
                        : 'hover:bg-zinc-900/60 text-zinc-300'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="font-semibold text-xs text-white">{food.name}</div>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 font-mono">
                        {food.preparation_state}
                      </span>
                    </div>
                    <div className="text-[11px] text-zinc-400 mt-1">{food.food_group}</div>
                  </Link>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Detailed Nutrition & Portion Calculator */}
        <div className="lg:col-span-7 space-y-4">
          {!selectedFoodDetails ? (
            <div className="p-10 border border-zinc-800 rounded-xl bg-zinc-900/20 text-center text-xs text-zinc-500">
              Selecione um alimento ao lado para visualizar a composição nutricional detalhada.
            </div>
          ) : (
            <>
              {/* Portion Selector Box */}
              <div className="p-5 rounded-xl border border-zinc-800 bg-zinc-900/50 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-800 pb-3">
                  <div>
                    <h2 className="text-base font-bold text-white">{selectedFoodDetails.name}</h2>
                    <p className="text-xs text-zinc-400">
                      Código TACO: <span className="font-mono text-zinc-300">{selectedFoodDetails.source_food_code}</span> | Grupo: {selectedFoodDetails.food_group}
                    </p>
                  </div>
                  <span className="self-start text-[11px] px-2.5 py-1 rounded bg-emerald-950/50 text-emerald-400 border border-emerald-800/40">
                    Fonte: TACO 4ª Edição
                  </span>
                </div>

                {/* Grams Selector */}
                <form method="GET" className="flex items-center space-x-3">
                  <input type="hidden" name="q" value={searchQuery} />
                  <input type="hidden" name="group" value={selectedGroup} />
                  <input type="hidden" name="selectedId" value={selectedFoodDetails.id} />
                  <div className="flex items-center space-x-2">
                    <Scale className="w-4 h-4 text-emerald-400" />
                    <label htmlFor="gramsInput" className="text-xs font-semibold text-zinc-300">
                      Gramatura da Porção:
                    </label>
                  </div>
                  <div className="flex items-center space-x-1.5">
                    <input
                      id="gramsInput"
                      type="number"
                      name="grams"
                      min="1"
                      max="2000"
                      step="5"
                      defaultValue={portionGrams}
                      className="w-24 px-2.5 py-1.5 bg-zinc-950 border border-zinc-800 rounded-lg text-xs font-mono text-white text-right focus:outline-none focus:border-emerald-500"
                    />
                    <span className="text-xs text-zinc-400 font-mono">g</span>
                  </div>
                  <button
                    type="submit"
                    className="bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
                  >
                    Recalcular
                  </button>
                </form>

                {/* Household Measures Shortcuts */}
                {selectedFoodDetails.household_measures && selectedFoodDetails.household_measures.length > 0 && (
                  <div className="pt-2 border-t border-zinc-800/60">
                    <div className="text-[11px] text-zinc-400 font-medium mb-1.5">
                      Medidas Caseiras de Referência (clique para aplicar):
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {selectedFoodDetails.household_measures.map((m, idx) => (
                        <Link
                          key={idx}
                          href={`/professional/foods?q=${encodeURIComponent(searchQuery)}&group=${encodeURIComponent(
                            selectedGroup
                          )}&selectedId=${selectedFoodDetails?.id}&grams=${m.grams}`}
                          className="text-[11px] px-2.5 py-1 rounded bg-zinc-800/60 hover:bg-zinc-800 border border-zinc-700/50 text-zinc-300 transition-colors font-mono"
                        >
                          {m.label} ({m.grams}g)
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Economic Metrics */}
              {economicMetrics && economicMetrics.price_per_kg && (
                <div className="grid grid-cols-3 gap-3">
                  <div className="p-3 rounded-xl border border-zinc-800 bg-zinc-900/30 text-center space-y-0.5">
                    <div className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider">Custo da Porção ({portionGrams}g)</div>
                    <div className="text-sm font-extrabold text-emerald-400 font-mono">
                      R$ {portionNutrition?.estimated_portion_cost?.toFixed(2) || '—'}
                    </div>
                  </div>
                  <div className="p-3 rounded-xl border border-zinc-800 bg-zinc-900/30 text-center space-y-0.5">
                    <div className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider">Custo por 100 kcal</div>
                    <div className="text-sm font-extrabold text-sky-400 font-mono">
                      R$ {economicMetrics.cost_per_100_kcal?.toFixed(2) || '—'}
                    </div>
                  </div>
                  <div className="p-3 rounded-xl border border-zinc-800 bg-zinc-900/30 text-center space-y-0.5">
                    <div className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider">Custo por 10g Proteína</div>
                    <div className="text-sm font-extrabold text-amber-400 font-mono">
                      R$ {economicMetrics.cost_per_10g_protein?.toFixed(2) || '—'}
                    </div>
                  </div>
                </div>
              )}

              {/* Nutrients Table */}
              <div className="border border-zinc-800 rounded-xl overflow-hidden bg-zinc-900/40">
                <div className="px-4 py-3 bg-zinc-950 border-b border-zinc-800 flex items-center justify-between">
                  <span className="text-xs font-bold text-white uppercase tracking-wider">
                    Composição Nutricional Calculada ({portionGrams}g)
                  </span>
                  <span className="text-[11px] text-zinc-400">
                    Consistência: <span className="text-emerald-400 font-mono">{selectedFoodDetails.energy_consistency_status}</span>
                  </span>
                </div>

                <div className="p-4">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                    <div className="p-3 rounded-lg bg-zinc-950 border border-zinc-800/80">
                      <div className="text-[10px] font-medium text-zinc-400">Energia</div>
                      <div className="text-base font-extrabold text-white font-mono mt-0.5">
                        {portionNutrition?.nutrients.energy_kcal?.amount !== null
                          ? `${portionNutrition?.nutrients.energy_kcal?.amount} kcal`
                          : 'NA'}
                      </div>
                    </div>
                    <div className="p-3 rounded-lg bg-zinc-950 border border-zinc-800/80">
                      <div className="text-[10px] font-medium text-zinc-400">Proteína</div>
                      <div className="text-base font-extrabold text-emerald-400 font-mono mt-0.5">
                        {portionNutrition?.nutrients.protein_g?.amount !== null
                          ? `${portionNutrition?.nutrients.protein_g?.amount} g`
                          : 'NA'}
                      </div>
                    </div>
                    <div className="p-3 rounded-lg bg-zinc-950 border border-zinc-800/80">
                      <div className="text-[10px] font-medium text-zinc-400">Carboidrato</div>
                      <div className="text-base font-extrabold text-sky-400 font-mono mt-0.5">
                        {portionNutrition?.nutrients.carbohydrate_g?.amount !== null
                          ? `${portionNutrition?.nutrients.carbohydrate_g?.amount} g`
                          : 'NA'}
                      </div>
                    </div>
                    <div className="p-3 rounded-lg bg-zinc-950 border border-zinc-800/80">
                      <div className="text-[10px] font-medium text-zinc-400">Lipídios</div>
                      <div className="text-base font-extrabold text-amber-400 font-mono mt-0.5">
                        {portionNutrition?.nutrients.fat_g?.amount !== null
                          ? `${portionNutrition?.nutrients.fat_g?.amount} g`
                          : 'NA'}
                      </div>
                    </div>
                  </div>

                  {/* Detailed Nutrients List */}
                  <table className="w-full text-left text-xs text-zinc-300">
                    <thead className="text-[11px] text-zinc-400 border-b border-zinc-800">
                      <tr>
                        <th className="py-2">Nutriente</th>
                        <th className="py-2 text-right">Quantidade ({portionGrams}g)</th>
                        <th className="py-2 text-right">Por 100g (TACO)</th>
                        <th className="py-2 text-right">Qualidade Analítica</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/40">
                      {portionNutrition &&
                        Object.entries(portionNutrition.nutrients).map(([code, item]) => {
                          const baseAmount = selectedFoodDetails?.nutrients?.[code]?.amount_per_100g;

                          return (
                            <tr key={code} className="hover:bg-zinc-900/40">
                              <td className="py-2 text-zinc-300 font-medium">{item.name}</td>
                              <td className="py-2 text-right font-mono text-white">
                                {item.amount !== null ? `${item.amount} ${item.unit}` : <span className="text-zinc-500">Não analisado</span>}
                              </td>
                              <td className="py-2 text-right font-mono text-zinc-400">
                                {baseAmount !== null && baseAmount !== undefined ? `${baseAmount} ${item.unit}` : <span className="text-zinc-500">—</span>}
                              </td>
                              <td className="py-2 text-right text-[10px] font-mono text-zinc-500">
                                {item.data_quality}
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
