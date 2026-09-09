import React from 'react';
import Link from 'next/link';
import { requireRole } from '@/lib/auth/guards';
import { searchFoodsAction, importTacoDatasetAction, toggleFoodActiveAction } from '@/app/actions/foods';
import { Database, Search, ArrowLeft, RefreshCw, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import { revalidatePath } from 'next/cache';

interface AdminFoodsPageProps {
  searchParams: Promise<{
    q?: string;
    group?: string;
    eligibility?: string;
  }>;
}

export default async function AdminFoodsPage({ searchParams }: AdminFoodsPageProps) {
  await requireRole('admin');
  const params = await searchParams;

  const searchQuery = params.q || '';
  const selectedGroup = params.group || '';
  const selectedEligibility = params.eligibility || '';

  const searchResult = await searchFoodsAction({
    query: searchQuery,
    foodGroup: selectedGroup || undefined,
    eligibilityStatus: selectedEligibility || undefined,
    limit: 50,
  });

  const foods = searchResult.data?.foods || [];
  const total = searchResult.data?.total || 0;

  async function handleImport() {
    'use server';
    await importTacoDatasetAction();
    revalidatePath('/admin/foods');
  }

  async function handleToggle(foodId: string, currentActive: boolean) {
    'use server';
    await toggleFoodActiveAction(foodId, !currentActive);
    revalidatePath('/admin/foods');
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
    <div className="flex-1 max-w-6xl w-full mx-auto px-4 py-8 sm:px-6 lg:px-8 space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-5">
        <div>
          <div className="flex items-center space-x-2 text-xs font-semibold text-emerald-400 uppercase tracking-wider mb-1">
            <Database className="w-4 h-4" />
            <span>Gestão Oficial de Alimentos (ETAPA 5)</span>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Catálogo de Alimentos & Nutrientes</h1>
          <p className="text-xs text-zinc-400 mt-0.5">
            Fonte oficial: TACO 4ª edição (NEPA/UNICAMP) com valores analíticos e guardrails de elegibilidade.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <form action={handleImport}>
            <button
              type="submit"
              className="inline-flex items-center space-x-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-3.5 py-2 rounded-lg transition-colors shadow-sm cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Sincronizar / Importar TACO</span>
            </button>
          </form>

          <Link
            href="/admin"
            className="inline-flex items-center space-x-1.5 text-xs text-zinc-400 hover:text-white border border-zinc-800 bg-zinc-900 px-3 py-2 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Voltar</span>
          </Link>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/50 space-y-3">
        <form method="GET" className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div className="sm:col-span-2 relative">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              name="q"
              defaultValue={searchQuery}
              placeholder="Buscar por nome do alimento ou sinônimo..."
              className="w-full pl-9 pr-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <select
              name="group"
              defaultValue={selectedGroup}
              className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-200 focus:outline-none focus:border-emerald-500"
            >
              <option value="">Todos os Grupos</option>
              {foodGroups.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center space-x-2">
            <select
              name="eligibility"
              defaultValue={selectedEligibility}
              className="flex-1 px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-200 focus:outline-none focus:border-emerald-500"
            >
              <option value="">Status de Elegibilidade</option>
              <option value="eligible_for_engine">Elegível para o Motor</option>
              <option value="needs_review">Requer Revisão</option>
              <option value="incomplete_nutrition">Incompleto</option>
              <option value="disabled">Desativado</option>
            </select>
            <button
              type="submit"
              className="bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold px-3 py-2 rounded-lg transition-colors cursor-pointer"
            >
              Filtrar
            </button>
          </div>
        </form>

        <div className="flex items-center justify-between text-xs text-zinc-400 pt-1 border-t border-zinc-800/60">
          <span>Total cadastrado: {total} alimentos</span>
          <span className="text-zinc-500">Apenas administradores podem ativar/desativar alimentos do motor</span>
        </div>
      </div>

      {/* Food Table */}
      <div className="border border-zinc-800 rounded-xl overflow-hidden bg-zinc-900/30">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-zinc-300">
            <thead className="bg-zinc-950 text-zinc-400 uppercase tracking-wider text-[11px] border-b border-zinc-800 font-semibold">
              <tr>
                <th className="px-4 py-3">Código</th>
                <th className="px-4 py-3">Alimento</th>
                <th className="px-4 py-3">Grupo</th>
                <th className="px-4 py-3">Preparo</th>
                <th className="px-4 py-3">Elegibilidade</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {foods.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-zinc-500">
                    Nenhum alimento encontrado. Clique em &quot;Sincronizar / Importar TACO&quot; para carregar a base oficial.
                  </td>
                </tr>
              ) : (
                foods.map((food) => {
                  const isEligible = food.engine_eligibility_status === 'eligible_for_engine';

                  return (
                    <tr key={food.id} className="hover:bg-zinc-900/60 transition-colors">
                      <td className="px-4 py-3 font-mono text-zinc-400">{food.source_food_code}</td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-white">{food.name}</div>
                        {food.scientific_name && (
                          <div className="text-[10px] text-zinc-500 italic">{food.scientific_name}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-zinc-400">{food.food_group}</td>
                      <td className="px-4 py-3">
                        <span className="inline-block px-2 py-0.5 rounded text-[10px] bg-zinc-800 text-zinc-300 font-mono">
                          {food.preparation_state}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {isEligible ? (
                          <span className="inline-flex items-center space-x-1 text-emerald-400 text-[11px]">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Elegível</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center space-x-1 text-amber-400 text-[11px]">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            <span>{food.engine_eligibility_status}</span>
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {food.is_active ? (
                          <span className="text-emerald-400 text-[11px] font-medium">Ativo</span>
                        ) : (
                          <span className="inline-flex items-center space-x-1 text-rose-400 text-[11px]">
                            <XCircle className="w-3.5 h-3.5" />
                            <span>Desativado</span>
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <form
                          action={async () => {
                            'use server';
                            await handleToggle(food.id, food.is_active);
                          }}
                        >
                          <button
                            type="submit"
                            className={`text-[11px] font-semibold px-2.5 py-1 rounded transition-colors cursor-pointer ${
                              food.is_active
                                ? 'bg-rose-950/40 text-rose-400 border border-rose-800/40 hover:bg-rose-900/60'
                                : 'bg-emerald-950/40 text-emerald-400 border border-emerald-800/40 hover:bg-emerald-900/60'
                            }`}
                          >
                            {food.is_active ? 'Desativar' : 'Ativar'}
                          </button>
                        </form>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
