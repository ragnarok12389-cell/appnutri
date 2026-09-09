import { describe, it, expect } from 'vitest';
import { AICompanionOrchestrator } from '@/lib/ai-companion/orchestrator';
import { MockAIProvider } from '@/lib/ai-companion/provider';
import { AIRateLimiter, InMemoryRateLimitStore, RATE_LIMIT_CONFIG } from '@/lib/ai-companion/rate-limiter';
import { ToolExecutionContext } from '@/lib/ai-companion/tools';
import { ProfileContextPack } from '@/types/ai-companion';
import { NutritionConstraints } from '@/types/nutrition-engine';
import { WorkoutConstraints } from '@/types/workout-engine';

describe('ETAPA 8: AI Companion — Failure Modes, Rate Limiting & Fail-Closed', () => {
  const PATIENT_ID = 'test-patient-fail-closed';
  const CONV_ID = 'conv-fail-closed';

  const mockServices: ToolExecutionContext['dataServices'] = {
    async getActiveDietPlan() { return {}; },
    async getTodayMeals() { return []; },
    async getActiveWorkoutProgram() { return {}; },
    async getTodayWorkout() { return {}; },
    async getProgressSummary() { return {}; },
    async getDietConstraints() { return {} as unknown as NutritionConstraints; },
    async getFoodItem() { return null; },
    async getFoodCatalog() { return []; },
    async getWorkoutConstraints() { return {} as unknown as WorkoutConstraints; },
    async recordFeedback() { return { id: '1', status: 'recorded' }; },
    async createPendingAction() {},
    async getPendingAction() { return null; },
    async consumePendingAction() {},
    async applyDietSubstitution() { return { success: true, new_item_id: '1' }; },
  };

  it('Fail-Closed: Quando o provedor falha com erro de rede ou timeout, responde com mensagem segura', async () => {
    const brokenProvider = new MockAIProvider(async () => {
      throw new Error('Connection timeout to Gemini API (ETIMEDOUT)');
    });

    const orchestrator = new AICompanionOrchestrator({
      provider: brokenProvider,
      contextDataSource: {
        async getProfile() { return {} as unknown as ProfileContextPack; },
        async getDietPlan() { return { has_active_plan: false, today_meals: [] }; },
        async getWorkoutProgram() { return { has_active_program: false }; },
        async getProgress() { return { recent_sessions_completed: 0 }; },
        async getConversationHistory() { return { recent_messages: [] }; },
      },
      rateLimiter: new AIRateLimiter(),
      toolDataServices: mockServices,
    });

    const result = await orchestrator.processMessage({
      patientId: PATIENT_ID,
      conversationId: CONV_ID,
      userMessage: 'Olá, qual meu treino?',
    });

    expect(result.success).toBe(false);
    expect(result.safety_flags).toContain('system_error_fail_closed');
    expect(result.content).toContain('instabilidade temporária');
  });

  it('deve bloquear usuário que exceder o limite de taxa de 20 mensagens por janela', async () => {
    const store = new InMemoryRateLimitStore();
    const rateLimiter = new AIRateLimiter(store);

    // Simula 20 mensagens já enviadas
    for (let i = 0; i < RATE_LIMIT_CONFIG.MAX_MESSAGES_PER_WINDOW; i++) {
      await rateLimiter.recordMessage(PATIENT_ID);
    }

    const orchestrator = new AICompanionOrchestrator({
      provider: new MockAIProvider(),
      contextDataSource: {
        async getProfile() { return {} as unknown as ProfileContextPack; },
        async getDietPlan() { return { has_active_plan: false, today_meals: [] }; },
        async getWorkoutProgram() { return { has_active_program: false }; },
        async getProgress() { return { recent_sessions_completed: 0 }; },
        async getConversationHistory() { return { recent_messages: [] }; },
      },
      rateLimiter,
      toolDataServices: mockServices,
    });

    // 21ª mensagem deve ser bloqueada
    const result = await orchestrator.processMessage({
      patientId: PATIENT_ID,
      conversationId: CONV_ID,
      userMessage: 'Tentando enviar a 21ª mensagem',
    });

    expect(result.success).toBe(false);
    expect(result.safety_flags).toContain('rate_limit_exceeded');
    expect(result.content).toContain('Limite de 20 mensagens atingido');
  });

  it('deve rejeitar mensagens que excedam 1.000 caracteres com input_length_exceeded', async () => {
    const orchestrator = new AICompanionOrchestrator({
      provider: new MockAIProvider(),
      contextDataSource: {
        async getProfile() { return {} as unknown as ProfileContextPack; },
        async getDietPlan() { return { has_active_plan: false, today_meals: [] }; },
        async getWorkoutProgram() { return { has_active_program: false }; },
        async getProgress() { return { recent_sessions_completed: 0 }; },
        async getConversationHistory() { return { recent_messages: [] }; },
      },
      rateLimiter: new AIRateLimiter(),
      toolDataServices: mockServices,
    });

    const hugeMessage = 'a'.repeat(1001);

    const result = await orchestrator.processMessage({
      patientId: PATIENT_ID,
      conversationId: CONV_ID,
      userMessage: hugeMessage,
    });

    expect(result.success).toBe(false);
    expect(result.safety_flags).toContain('input_length_exceeded');
  });

  it('deve detectar e interromper loop de ferramentas com mesmos argumentos', async () => {
    // Provedor que insiste em chamar a mesma tool infinitamente
    const loopingProvider = new MockAIProvider(async () => {
      return {
        content: null,
        tool_calls: [
          {
            id: 'loop-call',
            type: 'function',
            function: {
              name: 'getActiveDietPlan',
              arguments: JSON.stringify({}),
            },
          },
        ],
        finish_reason: 'tool_calls',
      };
    });

    const orchestrator = new AICompanionOrchestrator({
      provider: loopingProvider,
      contextDataSource: {
        async getProfile() { return {} as unknown as ProfileContextPack; },
        async getDietPlan() { return { has_active_plan: false, today_meals: [] }; },
        async getWorkoutProgram() { return { has_active_program: false }; },
        async getProgress() { return { recent_sessions_completed: 0 }; },
        async getConversationHistory() { return { recent_messages: [] }; },
      },
      rateLimiter: new AIRateLimiter(),
      toolDataServices: mockServices,
    });

    const result = await orchestrator.processMessage({
      patientId: PATIENT_ID,
      conversationId: CONV_ID,
      userMessage: 'Mostre minha dieta',
    });

    expect(result.success).toBe(true);
    expect(result.content).toContain('repetição');
  });
});
