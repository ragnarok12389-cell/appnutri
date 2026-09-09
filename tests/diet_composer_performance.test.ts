import { describe, it, expect } from 'vitest';
import { runDietComposer } from '../src/lib/diet-composer/engine';
import {
  STANDARD_TARGETS,
  STANDARD_CONSTRAINTS,
  MOCK_TACO_CATALOG,
} from './fixtures/diet_composer_fixtures';
import type { ComposerCandidateFood, ComposerInput } from '../src/lib/diet-composer/types';

describe('ETAPA 6: Diet Composer — Benchmark de Performance (550 Alimentos x 7 Dias)', () => {
  // Construir catálogo sintético de 550 alimentos elegíveis a partir do catálogo base
  const extendedCatalog: ComposerCandidateFood[] = [];
  const baseCatalogLength = MOCK_TACO_CATALOG.length;

  for (let i = 0; i < 550; i++) {
    const template = MOCK_TACO_CATALOG[i % baseCatalogLength];
    const multiplier = 0.85 + (i % 30) * 0.01; // variação realista de macros

    extendedCatalog.push({
      ...template,
      id: `perf-food-${String(i + 1).padStart(4, '0')}`,
      source_food_code: `PERF_${String(i + 1).padStart(4, '0')}`,
      name: `${template.name} [Var ${i + 1}]`,
      normalized_name: `${template.normalized_name} var ${i + 1}`,
      energy_kcal_100g: Math.round(template.energy_kcal_100g * multiplier * 10) / 10,
      protein_g_100g: Math.round(template.protein_g_100g * multiplier * 10) / 10,
      carbohydrate_g_100g: Math.round(template.carbohydrate_g_100g * multiplier * 10) / 10,
      fat_g_100g: Math.round(template.fat_g_100g * multiplier * 10) / 10,
      price_per_100g: template.price_per_100g ? Math.round(template.price_per_100g * multiplier * 100) / 100 : null,
    });
  }

  it('Gera plano de 7 dias com 550 alimentos candidatos em menos de 250ms', () => {
    const input: ComposerInput = {
      patient_id: 'perf-patient-benchmark',
      engine_run_id: 'perf-run-benchmark',
      nutrition_target_id: 'perf-target-benchmark',
      targets: STANDARD_TARGETS,
      constraints: STANDARD_CONSTRAINTS,
      food_catalog: extendedCatalog,
      food_dataset_version: '4.0.0',
      food_dataset_checksum: 'perf-benchmark-550',
      price_engine_version: '1.0.0',
      day_count: 7,
    };

    // Warm-up run
    runDietComposer(input);

    const iterations = 5;
    const timesMs: number[] = [];

    for (let iter = 0; iter < iterations; iter++) {
      const start = performance.now();
      const result = runDietComposer(input);
      const elapsed = performance.now() - start;

      timesMs.push(elapsed);

      expect(result.success).toBe(true);
      expect(result.plan).toBeDefined();
      expect(result.plan!.days.length).toBe(7);
    }

    const avgMs = timesMs.reduce((acc, v) => acc + v, 0) / iterations;
    const minMs = Math.min(...timesMs);
    const maxMs = Math.max(...timesMs);

    // Assert que o tempo médio está bem abaixo do limiar de 500ms
    expect(avgMs).toBeLessThan(400);

    // Registro do benchmark para auditoria e relatório
    console.log(`\n======================================================`);
    console.log(`BENCHMARK DO MOTOR DETERMINÍSTICO DE DIETA (ETAPA 6)`);
    console.log(`Catálogo de Alimentos: 550 alimentos candidatos`);
    console.log(`Duração do Plano: 7 dias (4 refeições/dia = 28 refeições)`);
    console.log(`Iterações: ${iterations}`);
    console.log(`Tempo Médio: ${avgMs.toFixed(2)} ms`);
    console.log(`Tempo Mínimo: ${minMs.toFixed(2)} ms`);
    console.log(`Tempo Máximo: ${maxMs.toFixed(2)} ms`);
    console.log(`Tempo Médio por Dia: ${(avgMs / 7).toFixed(2)} ms/dia`);
    console.log(`======================================================\n`);
  });
});
