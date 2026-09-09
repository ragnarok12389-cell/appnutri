import { describe, it, expect } from 'vitest';
import { runWorkoutComposer } from '@/lib/workout-engine/engine';
import { createMockComposerInput } from './fixtures/workout_fixtures';

describe('ETAPA 7: Motor Determinístico de Treino — Benchmark de Performance', () => {
  it('deve gerar programa de 6 dias em menos de 200ms por execução', () => {
    const input = createMockComposerInput({
      objective: 'hypertrophy',
      experience_level: 'advanced',
      sessions_per_week: 6,
    });

    const iterations = 5;
    const times: number[] = [];

    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      const result = runWorkoutComposer(input);
      const end = performance.now();

      expect(result.success).toBe(true);
      times.push(end - start);
    }

    const avgTime = times.reduce((a, b) => a + b, 0) / iterations;
    const minTime = Math.min(...times);
    const maxTime = Math.max(...times);

    console.log('\n======================================================');
    console.log('BENCHMARK DO MOTOR DETERMINÍSTICO DE TREINO (ETAPA 7)');
    console.log(`Frequência: 6 dias por semana (Divisão Push/Pull/Legs)`);
    console.log(`Iterações: ${iterations}`);
    console.log(`Tempo Médio: ${avgTime.toFixed(2)} ms`);
    console.log(`Tempo Mínimo: ${minTime.toFixed(2)} ms`);
    console.log(`Tempo Máximo: ${maxTime.toFixed(2)} ms`);
    console.log('======================================================\n');

    expect(avgTime).toBeLessThan(200); // Exigência do plano: < 200ms
  });
});
