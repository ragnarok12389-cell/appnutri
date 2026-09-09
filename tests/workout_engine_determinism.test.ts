import { describe, it, expect } from 'vitest';
import { runWorkoutComposer } from '@/lib/workout-engine/engine';
import { createMockComposerInput } from './fixtures/workout_fixtures';
import { computeWorkoutInputHash, canonicalJsonStringify } from '@/lib/workout-engine/hash';
import {
  EXERCISE_CATALOG_VERSION,
  EXERCISE_CATALOG_SCHEMA_VERSION,
  EXERCISE_CATALOG_CHECKSUM,
  EXERCISE_CATALOG_PROVENANCE,
  CURATED_EXERCISE_CATALOG,
  computeCatalogChecksum,
} from '@/lib/workout-engine/catalog';
import { Exercise } from '@/types/workout-engine';

describe('ETAPA 7: Motor Determinístico de Treino — Determinismo, Provenance e Hashes SHA-256', () => {
  it('deve produzir hashes SHA-256 e estruturas 100% idênticas em 100 execuções sucessivas', () => {
    const input = createMockComposerInput({
      objective: 'hypertrophy',
      experience_level: 'intermediate',
      sessions_per_week: 4,
    });

    const baselineResult = runWorkoutComposer(input);
    expect(baselineResult.success).toBe(true);
    const baselineProgram = baselineResult.program!;

    const baselineInputHash = baselineProgram.input_snapshot_hash;
    const baselineOutputHash = baselineProgram.output_program_hash;

    expect(baselineInputHash).toMatch(/^[a-f0-9]{64}$/);
    expect(baselineOutputHash).toMatch(/^[a-f0-9]{64}$/);

    for (let i = 0; i < 100; i++) {
      const currentResult = runWorkoutComposer(input);
      expect(currentResult.success).toBe(true);
      const currentProgram = currentResult.program!;

      expect(currentProgram.input_snapshot_hash).toBe(baselineInputHash);
      expect(currentProgram.output_program_hash).toBe(baselineOutputHash);

      // Conferir cada exercício e série
      expect(currentProgram.days.length).toBe(baselineProgram.days.length);
      for (let d = 0; d < currentProgram.days.length; d++) {
        const curDay = currentProgram.days[d];
        const baseDay = baselineProgram.days[d];
        expect(curDay.is_rest_day).toBe(baseDay.is_rest_day);
        expect(curDay.sessions.length).toBe(baseDay.sessions.length);

        if (!curDay.is_rest_day) {
          const curSession = curDay.sessions[0];
          const baseSession = baseDay.sessions[0];
          expect(curSession.exercises.length).toBe(baseSession.exercises.length);

          for (let e = 0; e < curSession.exercises.length; e++) {
            expect(curSession.exercises[e].exercise_id).toBe(baseSession.exercises[e].exercise_id);
            expect(curSession.exercises[e].prescribed_sets).toBe(baseSession.exercises[e].prescribed_sets);
            expect(curSession.exercises[e].min_reps).toBe(baseSession.exercises[e].min_reps);
            expect(curSession.exercises[e].max_reps).toBe(baseSession.exercises[e].max_reps);
            expect(curSession.exercises[e].rest_seconds).toBe(baseSession.exercises[e].rest_seconds);
          }
        }
      }
    }
  });

  it('deve congelar a identidade reproduzível do catálogo no programa de treino', () => {
    const input = createMockComposerInput({
      objective: 'hypertrophy',
      experience_level: 'intermediate',
      sessions_per_week: 3,
    });

    const result = runWorkoutComposer(input);
    expect(result.success).toBe(true);
    const program = result.program!;

    expect(program.catalog_version).toBe(EXERCISE_CATALOG_VERSION);
    expect(program.catalog_checksum).toBe(EXERCISE_CATALOG_CHECKSUM);
    expect(program.catalog_provenance).toBe(EXERCISE_CATALOG_PROVENANCE);
    expect(EXERCISE_CATALOG_SCHEMA_VERSION).toBe('1.0.0');

    // Verificar que cada exercício contém snapshot histórico completo
    for (const day of program.days.filter((d) => !d.is_rest_day)) {
      for (const session of day.sessions) {
        for (const ex of session.exercises) {
          expect(ex.exercise_snapshot_hash).toMatch(/^[a-f0-9]{64}$/);
          expect(ex.primary_muscle_groups.length).toBeGreaterThan(0);
          expect(ex.required_equipment.length).toBeGreaterThan(0);
          expect(['beginner', 'intermediate', 'advanced']).toContain(ex.complexity_level);
          expect(typeof ex.is_unilateral).toBe('boolean');
          expect(typeof ex.is_compound).toBe('boolean');
          expect(ex.catalog_source_version).toBe(EXERCISE_CATALOG_VERSION);
        }
      }
    }
  });

  it('alterações futuras no catálogo de exercícios NÃO podem alterar semanticamente programas já gerados', () => {
    const input = createMockComposerInput({
      objective: 'hypertrophy',
      experience_level: 'intermediate',
      sessions_per_week: 3,
    });

    const originalResult = runWorkoutComposer(input);
    expect(originalResult.success).toBe(true);
    const originalProgram = originalResult.program!;

    // Criar um catálogo "futuro" modificado (com exercícios renomeados, mutados e com itens adicionais)
    const futureCatalog: Exercise[] = [
      ...CURATED_EXERCISE_CATALOG.map((ex) => ({
        ...ex,
        name: `${ex.name} (Versão 2.0 Futura)`,
        instructions: 'Instruções modificadas em 2027',
        source_version: '2.0.0',
      })),
      {
        id: 'ex-future-999',
        code: 'FUTURE_AI_EXERCISE',
        name: 'Exercício Criado no Futuro',
        normalized_name: 'exercicio criado no futuro',
        aliases: [],
        movement_pattern: 'squat',
        primary_muscle_groups: ['quadriceps'],
        secondary_muscle_groups: [],
        required_equipment: ['barbell'],
        complexity_level: 'advanced',
        is_unilateral: false,
        is_compound: true,
        safety_contraindications: [],
        instructions: '',
        source_version: '2.0.0',
        provenance: 'Future Curated Catalog',
        is_active: true,
      },
    ];

    // O programa original gerado mantém seus snapshots, nomes e hashes inalterados
    expect(originalProgram.catalog_version).toBe(EXERCISE_CATALOG_VERSION);
    for (const day of originalProgram.days.filter((d) => !d.is_rest_day)) {
      for (const session of day.sessions) {
        for (const ex of session.exercises) {
          expect(ex.exercise_name).not.toContain('(Versão 2.0 Futura)');
          expect(ex.catalog_source_version).toBe('1.0.0');
          expect(ex.exercise_snapshot_hash).toMatch(/^[a-f0-9]{64}$/);
        }
      }
    }

    // Um novo programa gerado com o catálogo futuro possui sua própria versão e hashes independentes
    const futureResult = runWorkoutComposer({
      ...input,
      catalog: futureCatalog,
      catalog_version: '2.0.0',
    });
    expect(futureResult.success).toBe(true);
    expect(futureResult.program!.catalog_version).toBe('2.0.0');
    expect(futureResult.program!.output_program_hash).not.toBe(originalProgram.output_program_hash);
  });

  it('deve garantir invariância na ordem de chaves do JSON (serialização canônica)', () => {
    const obj1 = { z: 1, a: 2, m: { y: 'bar', b: 'foo' } };
    const obj2 = { a: 2, m: { b: 'foo', y: 'bar' }, z: 1 };

    const str1 = canonicalJsonStringify(obj1);
    const str2 = canonicalJsonStringify(obj2);

    expect(str1).toBe(str2);
    expect(str1).toBe('{"a":2,"m":{"b":"foo","y":"bar"},"z":1}');
  });

  it('deve produzir o mesmo input_snapshot_hash mesmo se os equipamentos forem fornecidos em ordens diferentes', () => {
    const input1 = createMockComposerInput({
      constraints: {
        available_equipment: ['machine', 'barbell', 'dumbbell'],
        favorite_exercises: [],
        exercises_refused: [],
        movement_contraindications: [],
      },
    });

    const input2 = createMockComposerInput({
      constraints: {
        available_equipment: ['dumbbell', 'machine', 'barbell'],
        favorite_exercises: [],
        exercises_refused: [],
        movement_contraindications: [],
      },
    });

    const hash1 = computeWorkoutInputHash(input1);
    const hash2 = computeWorkoutInputHash(input2);

    expect(hash1).toBe(hash2);
  });

  describe('Auditoria Criptográfica do Catálogo de Exercícios (SHA-256 Canônico)', () => {
    it('1. Checksum corresponde ao formato SHA-256 esperado (64 caracteres hexadecimais minúsculos)', () => {
      const checksum = computeCatalogChecksum(CURATED_EXERCISE_CATALOG);
      expect(checksum).toMatch(/^[a-f0-9]{64}$/);
      expect(EXERCISE_CATALOG_CHECKSUM).toBe(checksum);
      expect(EXERCISE_CATALOG_CHECKSUM.length).toBe(64);
    });

    it('2. Mesmo catálogo -> mesmo checksum determinístico', () => {
      const copy = JSON.parse(JSON.stringify(CURATED_EXERCISE_CATALOG)) as Exercise[];
      const checksumA = computeCatalogChecksum(CURATED_EXERCISE_CATALOG);
      const checksumB = computeCatalogChecksum(copy);
      expect(checksumA).toBe(checksumB);
    });

    it('3. Ordem diferente dos mesmos exercícios -> mesmo checksum (ordenação canônica interna por id)', () => {
      const reversedCatalog = [...CURATED_EXERCISE_CATALOG].reverse();
      const shuffledCatalog = [...CURATED_EXERCISE_CATALOG].sort(() => 0.5 - Math.random());

      const normalChecksum = computeCatalogChecksum(CURATED_EXERCISE_CATALOG);
      const reversedChecksum = computeCatalogChecksum(reversedCatalog);
      const shuffledChecksum = computeCatalogChecksum(shuffledCatalog);

      expect(reversedChecksum).toBe(normalChecksum);
      expect(shuffledChecksum).toBe(normalChecksum);
    });

    it('4. Alteração semântica de um exercício -> checksum diferente', () => {
      const normalChecksum = computeCatalogChecksum(CURATED_EXERCISE_CATALOG);

      // Mutação semântica no primeiro exercício: altera primary_muscle_groups
      const mutatedCatalog1: Exercise[] = CURATED_EXERCISE_CATALOG.map((ex, idx) => {
        if (idx === 0) {
          return { ...ex, primary_muscle_groups: [...ex.primary_muscle_groups, 'biceps'] };
        }
        return { ...ex };
      });
      const mutatedChecksum1 = computeCatalogChecksum(mutatedCatalog1);
      expect(mutatedChecksum1).not.toBe(normalChecksum);
      expect(mutatedChecksum1).toMatch(/^[a-f0-9]{64}$/);

      // Mutação semântica no nome
      const mutatedCatalog2: Exercise[] = CURATED_EXERCISE_CATALOG.map((ex, idx) => {
        if (idx === 0) {
          return { ...ex, name: ex.name + ' Modificado' };
        }
        return { ...ex };
      });
      const mutatedChecksum2 = computeCatalogChecksum(mutatedCatalog2);
      expect(mutatedChecksum2).not.toBe(normalChecksum);

      // Mutação em contraindicações de segurança
      const mutatedCatalog3: Exercise[] = CURATED_EXERCISE_CATALOG.map((ex, idx) => {
        if (idx === 0) {
          return { ...ex, safety_contraindications: ['avoid_overhead_pressing'] };
        }
        return { ...ex };
      });
      const mutatedChecksum3 = computeCatalogChecksum(mutatedCatalog3);
      expect(mutatedChecksum3).not.toBe(normalChecksum);
    });
  });
});
