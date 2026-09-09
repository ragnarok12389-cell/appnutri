import { describe, it, expect } from 'vitest';
import { executeAITool, ToolExecutionContext } from '@/lib/ai-companion/tools';
import { MOCK_TACO_CATALOG, STANDARD_CONSTRAINTS } from './fixtures/diet_composer_fixtures';
import { DietMealItemSnapshot } from '@/types/diet-plan';

describe('ETAPA 8: AI Companion — Confirmation Flow for Write Actions', () => {
  const PATIENT_A_ID = 'patient-alpha-uuid';
  const PATIENT_B_ID = 'patient-beta-uuid';
  const MEAL_ID = '33333333-3333-4333-a333-333333333333';

  const mockChickenItem: DietMealItemSnapshot & { item_id: string; plan_id: string; meal_id: string } = {
    item_id: '44444444-4444-4444-8444-444444444444',
    plan_id: '55555555-5555-4555-8555-555555555555',
    meal_id: MEAL_ID,
    food_id: 'food-003', // Frango peito
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

  // Simulação de repositório de ações pendentes
  const pendingActions = new Map<string, {
    patient_id: string;
    action_type: string;
    payload: Record<string, unknown>;
    expires_at: Date;
    is_consumed: boolean;
  }>();

  const createMockContext = (patientId: string): ToolExecutionContext => ({
    patientId,
    conversationId: 'conv-1',
    dataServices: {
      async getActiveDietPlan() { return {}; },
      async getTodayMeals() { return []; },
      async getActiveWorkoutProgram() { return {}; },
      async getTodayWorkout() { return {}; },
      async getProgressSummary() { return {}; },
      async getDietConstraints() { return STANDARD_CONSTRAINTS; },
      async getFoodItem(_patientId, mealId, foodId) {
        if (mealId !== MEAL_ID) return null;
        if (foodId === 'food-003') return mockChickenItem;
        return null;
      },
      async getFoodCatalog() { return MOCK_TACO_CATALOG; },
      async getWorkoutConstraints() {
        return {
          available_equipment: [],
          movement_contraindications: [],
          favorite_exercises: [],
          exercises_refused: [],
          preferred_equipment: [],
        };
      },
      async recordFeedback() { return { id: '1', status: 'recorded' }; },
      async createPendingAction(action) {
        pendingActions.set(action.token, {
          patient_id: action.patient_id,
          action_type: action.action_type,
          payload: action.payload,
          expires_at: action.expires_at,
          is_consumed: false,
        });
      },
      async getPendingAction(token) {
        return pendingActions.get(token) ?? null;
      },
      async completePendingAction(token, _patientId, success) {
        const item = pendingActions.get(token);
        if (item && success) item.is_consumed = true;
      },
      async applyDietSubstitution() {
        return { success: true, new_plan_id: 'plan-version-123' };
      },
    },
  });

  it('proposeFoodSubstitution deve gerar token de ação pendente com requires_user_confirmation = true', async () => {
    const ctx = createMockContext(PATIENT_A_ID);

    // Propor troca de Frango (food-003) por Patinho bovino (food-004)
    const res = await executeAITool(
      'proposeFoodSubstitution',
      {
        meal_id: MEAL_ID,
        current_food_id: 'food-003',
        replacement_food_id: 'food-004',
      },
      ctx
    );

    expect(res.is_authorized).toBe(true);
    expect(res.requires_user_confirmation).toBe(true);
    expect(res.confirmation_token).toBeDefined();
    expect(res.confirmation_token?.startsWith('act_')).toBe(true);

    const output = res.output as { pending_action: boolean; details: { to: string } };
    expect(output.pending_action).toBe(true);
    expect(output.details.to).toContain('bovina');
  });

  it('applyAuthorizedFoodSubstitution deve efetivar troca quando token válido e pertencente ao paciente', async () => {
    const ctx = createMockContext(PATIENT_A_ID);

    // 1. Propor troca
    const propRes = await executeAITool(
      'proposeFoodSubstitution',
      {
        meal_id: MEAL_ID,
        current_food_id: 'food-003',
        replacement_food_id: 'food-004',
      },
      ctx
    );
    const token = propRes.confirmation_token!;

    // 2. Aplicar confirmação
    const applyRes = await executeAITool(
      'applyAuthorizedFoodSubstitution',
      { confirmation_token: token },
      ctx
    );

    expect(applyRes.is_authorized).toBe(true);
    const applyOutput = applyRes.output as { success: boolean; new_plan_id: string };
    expect(applyOutput.success).toBe(true);
    expect(applyOutput.new_plan_id).toBe('plan-version-123');
  });

  it('deve rejeitar reutilização de token já consumido com ACTION_ALREADY_CONSUMED', async () => {
    const ctx = createMockContext(PATIENT_A_ID);

    const propRes = await executeAITool(
      'proposeFoodSubstitution',
      {
        meal_id: MEAL_ID,
        current_food_id: 'food-003',
        replacement_food_id: 'food-004',
      },
      ctx
    );
    const token = propRes.confirmation_token!;

    // Primeira aplicação: sucesso
    await executeAITool('applyAuthorizedFoodSubstitution', { confirmation_token: token }, ctx);

    // Segunda aplicação: rejeição
    const retryRes = await executeAITool(
      'applyAuthorizedFoodSubstitution',
      { confirmation_token: token },
      ctx
    );

    expect(retryRes.is_authorized).toBe(false);
    expect(retryRes.error).toBe('ACTION_ALREADY_CONSUMED');
  });

  it('deve rejeitar token expirado com CONFIRMATION_EXPIRED', async () => {
    const ctx = createMockContext(PATIENT_A_ID);

    const expiredToken = 'act_expired_token_123';
    pendingActions.set(expiredToken, {
      patient_id: PATIENT_A_ID,
      action_type: 'food_substitution',
      payload: { meal_id: MEAL_ID },
      expires_at: new Date(Date.now() - 60000), // Expirou há 1 minuto
      is_consumed: false,
    });

    const res = await executeAITool(
      'applyAuthorizedFoodSubstitution',
      { confirmation_token: expiredToken },
      ctx
    );

    expect(res.is_authorized).toBe(false);
    expect(res.error).toBe('CONFIRMATION_EXPIRED');
  });

  it('Bloqueio Cross-Tenant: Paciente B NUNCA deve conseguir confirmar ação do Paciente A', async () => {
    const ctxA = createMockContext(PATIENT_A_ID);
    const ctxB = createMockContext(PATIENT_B_ID);

    // Paciente A gera a proposta
    const propRes = await executeAITool(
      'proposeFoodSubstitution',
      {
        meal_id: MEAL_ID,
        current_food_id: 'food-003',
        replacement_food_id: 'food-004',
      },
      ctxA
    );
    const token = propRes.confirmation_token!;

    // Paciente B tenta confirmar a ação com o token do Paciente A
    const res = await executeAITool(
      'applyAuthorizedFoodSubstitution',
      { confirmation_token: token },
      ctxB
    );

    expect(res.is_authorized).toBe(false);
    expect(res.error).toBe('CROSS_TENANT_ACTION_BLOCKED');
  });
});
