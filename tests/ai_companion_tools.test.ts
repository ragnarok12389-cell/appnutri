import { describe, it, expect } from 'vitest';
import { executeAITool, ToolExecutionContext } from '@/lib/ai-companion/tools';
import { MOCK_TACO_CATALOG, STANDARD_CONSTRAINTS } from './fixtures/diet_composer_fixtures';
import { createMockConstraints } from './fixtures/workout_fixtures';
import { DietMealItemSnapshot } from '@/types/diet-plan';

describe('ETAPA 8: AI Companion — Tool Registry & Deterministic Engine Integration', () => {
  const PATIENT_ID = 'test-patient-uuid';
  const CONVERSATION_ID = 'test-conv-uuid';

  const mockChickenItem: DietMealItemSnapshot & { item_id: string; plan_id: string; meal_id: string } = {
    item_id: '44444444-4444-4444-8444-444444444444',
    plan_id: '55555555-5555-4555-8555-555555555555',
    meal_id: '33333333-3333-4333-a333-333333333333',
    food_id: 'food-003', // Frango peito grelhado
    food_name: 'Frango, peito, sem pele, grelhado',
    source_id: 'src-1',
    source_food_code: '003',
    source_type: 'official_table',
    source_version: '4a_edicao_2011',
    grams: 100,
    energy_kcal: 159,
    protein_g: 32,
    carbohydrate_g: 0,
    fat_g: 2.5,
    fiber_g: 0,
    sodium_mg: 50,
    household_measure_label: null,
    household_measure_quantity: null,
    price_estimate: null,
    price_confidence: 1.0,
    price_source_level: 'item',
    currency: 'BRL',
    composition_snapshot_hash: 'hash_chick',
    item_order: 1,
  };

  const createMockContext = (overrides?: Partial<ToolExecutionContext['dataServices']>): ToolExecutionContext => ({
    patientId: PATIENT_ID,
    conversationId: CONVERSATION_ID,
    dataServices: {
      async getActiveDietPlan(id) {
        return { plan_id: 'active-plan', patient_id: id, calories: 2000 };
      },
      async getTodayMeals() {
        return [{ meal_id: 'meal-1', name: 'Almoço', items: ['Arroz', 'Frango'] }];
      },
      async getActiveWorkoutProgram(id) {
        return { program_id: 'active-prog', patient_id: id, split_type: 'upper_lower' };
      },
      async getTodayWorkout() {
        return { session_id: 'sess-1', name: 'Treino A', exercises: ['Supino'] };
      },
      async getProgressSummary(id) {
        return { patient_id: id, adherence_pct: 95 };
      },
      async getDietConstraints() {
        return STANDARD_CONSTRAINTS;
      },
      async getFoodItem(_patientId, mealId, foodId) {
        if (mealId !== mockChickenItem.meal_id) return null;
        if (foodId === 'food-003') return mockChickenItem;
        return null;
      },
      async getFoodCatalog() {
        return MOCK_TACO_CATALOG;
      },
      async getWorkoutConstraints() {
        return createMockConstraints({
          available_equipment: ['barbell', 'dumbbell', 'bench', 'machine'],
        });
      },
      async recordFeedback() {
        return { id: 'feedback-123', status: 'recorded' };
      },
      async createPendingAction() {},
      async getPendingAction() {
        return null;
      },
      async completePendingAction() {},
      async applyDietSubstitution() {
        return { success: true, new_plan_id: 'new-plan' };
      },
      ...overrides,
    },
  });

  it('deve executar ferramentas de leitura básica com sucesso', async () => {
    const ctx = createMockContext();

    const planRes = await executeAITool('getActiveDietPlan', {}, ctx);
    expect(planRes.is_authorized).toBe(true);
    expect((planRes.output as { plan_id: string }).plan_id).toBe('active-plan');

    const mealsRes = await executeAITool('getTodayMeals', {}, ctx);
    expect(mealsRes.is_authorized).toBe(true);
    expect(Array.isArray(mealsRes.output)).toBe(true);

    const progRes = await executeAITool('getActiveWorkoutProgram', {}, ctx);
    expect(progRes.is_authorized).toBe(true);
    expect((progRes.output as { split_type: string }).split_type).toBe('upper_lower');

    const workoutRes = await executeAITool('getTodayWorkout', {}, ctx);
    expect(workoutRes.is_authorized).toBe(true);
    expect((workoutRes.output as { session_id: string }).session_id).toBe('sess-1');
  });

  it('getFoodSubstitutionOptions deve invocar o motor determinístico da dieta e respeitar alergias', async () => {
    // Simula paciente alérgico a peixe
    const ctx = createMockContext({
      async getDietConstraints() {
        return {
          ...STANDARD_CONSTRAINTS,
          patient_reported_allergies: ['peixe'],
        };
      },
      async getFoodCatalog() {
        // Remove peixe da lista segura
        return MOCK_TACO_CATALOG.filter((f) => f.tags?.contains_fish !== 'true');
      },
    });

    const res = await executeAITool(
      'getFoodSubstitutionOptions',
      { meal_id: mockChickenItem.meal_id, food_id: 'food-003' },
      ctx
    );
    expect(res.is_authorized).toBe(true);
    const output = res.output as { options: Array<{ food_id: string }> };

    expect(output.options.length).toBeGreaterThan(0);
    // Salmão (food-011) NUNCA pode ser sugerido para paciente alérgico
    expect(output.options.some((o) => o.food_id === 'food-011')).toBe(false);
  });

  it('getExerciseSubstitutionOptions deve invocar o motor biomecânico e respeitar equipamentos disponíveis', async () => {
    const ctx = createMockContext({
      async getWorkoutConstraints() {
        // Paciente só tem halteres e banco
        return createMockConstraints({
          available_equipment: ['dumbbell', 'bench', 'bodyweight'],
        });
      },
    });

    const res = await executeAITool('getExerciseSubstitutionOptions', { exercise_id: 'BARBELL_BENCH_PRESS' }, ctx);
    expect(res.is_authorized).toBe(true);
    const exerciseOutput = res.output as { options: Array<{ code?: string; required_equipment: string[] }> };

    expect(exerciseOutput.options.length).toBeGreaterThan(0);
    // Deve sugerir Supino com Halteres
    expect(exerciseOutput.options.some((o) => o.code === 'DUMBBELL_BENCH_PRESS')).toBe(true);
    // Não pode sugerir Supino com Barra pois não tem barra
    expect(exerciseOutput.options.some((o) => o.required_equipment.includes('barbell'))).toBe(false);
  });

  it('deve falhar fechado quando restrições verificáveis de treino não estão disponíveis', async () => {
    const ctx = createMockContext({
      async getWorkoutConstraints() {
        return null;
      },
    });

    const result = await executeAITool(
      'getExerciseSubstitutionOptions',
      { exercise_id: 'BARBELL_BENCH_PRESS' },
      ctx
    );

    expect(result.is_authorized).toBe(false);
    expect(result.error).toBe('WORKOUT_CONSTRAINTS_UNAVAILABLE');
  });

  it('recordUserFeedback deve registrar feedback estruturado com sucesso', async () => {
    const ctx = createMockContext();
    const res = await executeAITool(
      'recordUserFeedback',
      {
        feedback_type: 'hunger_satiety',
        domain: 'nutrition',
        target_entity_type: 'meal',
        target_entity_id: 'meal-1',
        intensity_rating: 4,
        notes: 'Muita fome 1 hora após o almoço',
      },
      ctx
    );

    expect(res.is_authorized).toBe(true);
    const fbOutput = res.output as { success: boolean; feedback_id: string };
    expect(fbOutput.success).toBe(true);
    expect(fbOutput.feedback_id).toBe('feedback-123');
  });

  it('deve rejeitar ferramentas não registradas com erro seguro UNKNOWN_TOOL', async () => {
    const ctx = createMockContext();
    const res = await executeAITool('executeArbitrarySQLQuery', { query: 'SELECT 1' }, ctx);

    expect(res.is_authorized).toBe(false);
    expect(res.error).toBe('UNKNOWN_TOOL');
    expect(res.authorization_denial_reason).toContain('Ferramenta desconhecida');
  });

  it('deve rejeitar argumentos malformados com ARGUMENT_VALIDATION_FAILED', async () => {
    const ctx = createMockContext();
    // getFoodSubstitutionOptions exige food_id
    const res = await executeAITool('getFoodSubstitutionOptions', { invalid_param: 123 }, ctx);

    expect(res.is_authorized).toBe(false);
    expect(res.error).toBe('ARGUMENT_VALIDATION_FAILED');
  });
});
