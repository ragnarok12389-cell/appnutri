import { describe, it, expect } from 'vitest';
import { AIContextBuilder, ContextDataSource } from '@/lib/ai-companion/context-builder';
import {
  ProfileContextPack,
  DietContextPack,
  WorkoutContextPack,
} from '@/types/ai-companion';

describe('ETAPA 8: AI Companion — Context Builder & Tenant Isolation', () => {
  const PATIENT_A_ID = 'patient-alpha-uuid';
  const PATIENT_B_ID = 'patient-beta-uuid';

  // Mock de DataSource com isolamento estrito de dados por paciente
  const mockDatabase: Record<string, {
    profile: ProfileContextPack;
    diet: DietContextPack;
    workout: WorkoutContextPack;
  }> = {
    [PATIENT_A_ID]: {
      profile: {
        patient_id: PATIENT_A_ID,
        full_name: 'Paciente Alpha',
        objective: 'Hipertrofia Muscular',
        dietary_restrictions: ['sem_lactose'],
        allergies: ['amendoim'],
        movement_contraindications: ['avoid_axial_spinal_loading'],
      },
      diet: {
        has_active_plan: true,
        plan_id: 'plan-a',
        target_calories: 2400,
        target_protein_g: 160,
        target_carbs_g: 280,
        target_fat_g: 70,
        today_meals: [
          {
            meal_id: 'meal-a-1',
            name: 'Almoço',
            order: 2,
            items: [
              {
                food_id: 'food-001',
                food_name: 'Frango Grelhado',
                grams: 150,
                calories: 240,
                protein_g: 48,
                carbs_g: 0,
                fat_g: 4,
                household_measure: '1 filé grande',
              },
            ],
          },
        ],
      },
      workout: {
        has_active_program: true,
        program_id: 'prog-a',
        split_type: 'upper_lower',
        sessions_per_week: 4,
        today_session: {
          session_id: 'sess-a-1',
          name: 'Upper Body A',
          session_focus: 'upper',
          duration_minutes: 60,
          exercises: [
            {
              workout_exercise_id: 'we-a-1',
              exercise_id: 'ex-bench-001',
              name: 'Supino Reto com Barra',
              movement_pattern: 'push_horizontal',
              prescribed_sets: 4,
              min_reps: 8,
              max_reps: 12,
              target_rir: 2,
              rest_seconds: 90,
              progression_strategy: 'double_progression',
            },
          ],
        },
      },
    },
    [PATIENT_B_ID]: {
      profile: {
        patient_id: PATIENT_B_ID,
        full_name: 'Paciente Beta (Privado)',
        objective: 'Emagrecimento',
        dietary_restrictions: ['vegetariano'],
        allergies: ['camarao'],
        movement_contraindications: ['avoid_deep_knee_flexion'],
      },
      diet: {
        has_active_plan: true,
        plan_id: 'plan-b',
        target_calories: 1600,
        target_protein_g: 120,
        target_carbs_g: 180,
        target_fat_g: 45,
        today_meals: [],
      },
      workout: {
        has_active_program: false,
      },
    },
  };

  const createMockDataSource = (): ContextDataSource => ({
    async getProfile(patientId: string) {
      return mockDatabase[patientId]?.profile ?? {
        patient_id: patientId,
        full_name: 'Desconhecido',
        objective: 'Geral',
        dietary_restrictions: [],
        allergies: [],
        movement_contraindications: [],
      };
    },
    async getDietPlan(patientId: string) {
      return mockDatabase[patientId]?.diet ?? { has_active_plan: false, today_meals: [] };
    },
    async getWorkoutProgram(patientId: string) {
      return mockDatabase[patientId]?.workout ?? { has_active_program: false };
    },
    async getProgress() {
      return { recent_sessions_completed: 3, last_logged_session_date: '2026-09-08' };
    },
    async getConversationHistory() {
      return {
        recent_messages: [
          { role: 'user', content: 'Qual o meu treino de hoje?' },
          { role: 'assistant', content: 'Seu treino de hoje é Upper Body A.' },
        ],
        context_summary: 'Paciente iniciou o plano de hipertrofia com boa aderência.',
      };
    },
  });

  it('deve construir contexto contendo todas as seções obrigatórias para o Paciente A', async () => {
    const builder = new AIContextBuilder(createMockDataSource());
    const context = await builder.buildContext(PATIENT_A_ID);

    expect(context.profile.patient_id).toBe(PATIENT_A_ID);
    expect(context.profile.full_name).toBe('Paciente Alpha');
    expect(context.profile.allergies).toContain('amendoim');
    expect(context.diet.has_active_plan).toBe(true);
    expect(context.diet.today_meals.length).toBe(1);
    expect(context.diet.today_meals[0].items[0].food_name).toBe('Frango Grelhado');
    expect(context.workout.has_active_program).toBe(true);
    expect(context.workout.today_session?.name).toBe('Upper Body A');
    expect(context.conversation.recent_messages.length).toBe(2);
  });

  it('Isolamento de Tenant: Contexto do Paciente A NUNCA deve conter dados do Paciente B', async () => {
    const builder = new AIContextBuilder(createMockDataSource());
    const contextA = await builder.buildContext(PATIENT_A_ID);

    const serializedA = JSON.stringify(contextA);
    expect(serializedA).not.toContain('Paciente Beta');
    expect(serializedA).not.toContain('vegetariano');
    expect(serializedA).not.toContain('camarao');
    expect(serializedA).not.toContain('1600');
    expect(serializedA).not.toContain('plan-b');
  });

  it('Minimização de Dados: Contexto NUNCA deve conter tokens, senhas ou dados sensíveis', async () => {
    const builder = new AIContextBuilder(createMockDataSource());
    const context = await builder.buildContext(PATIENT_A_ID);
    const systemPrompt = AIContextBuilder.formatSystemPrompt(context);

    expect(systemPrompt).not.toContain('password');
    expect(systemPrompt).not.toContain('token');
    expect(systemPrompt).not.toContain('secret');
    expect(systemPrompt).not.toContain('email');
    expect(systemPrompt).not.toContain('cpf');
  });

  it('Formatação do Prompt de Sistema deve incluir regras de conduta invioláveis', () => {
    const mockContext: Parameters<typeof AIContextBuilder.formatSystemPrompt>[0] = {
      profile: {
        patient_id: 'test-patient-id',
        full_name: 'Teste',
        objective: 'Hipertrofia',
        allergies: [],
        dietary_restrictions: [],
        movement_contraindications: [],
      },
      diet: { has_active_plan: false, today_meals: [] },
      workout: { has_active_program: false },
      progress: { recent_sessions_completed: 0 },
      conversation: { recent_messages: [] },
      timestamp: '2026-09-09T09:00:00Z',
    };

    const prompt = AIContextBuilder.formatSystemPrompt(mockContext);

    expect(prompt).toContain('SYMPTOM != DIAGNOSIS');
    expect(prompt).toContain('Diet Composer e Workout Engine');
    expect(prompt).toContain('DIRETRIZES DE SEGURANÇA E CONDUTA');
  });
});
