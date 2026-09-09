/**
 * Tool Registry & Server-Side Executor — ETAPA 8
 * Cada ferramenta possui schema estrito, validação server-side de ownership,
 * e invoca exclusivamente serviços determinísticos pré-aprovados.
 * NUNCA confia em IDs fornecidos pelo modelo.
 */

import crypto from 'crypto';
import {
  AIProviderToolDefinition,
  AIToolName,
  GetFoodSubstitutionArgsSchema,
  GetExerciseSubstitutionArgsSchema,
  RecordFeedbackArgsSchema,
  ProposeFoodSubstitutionArgsSchema,
  ApplyAuthorizedFoodSubstitutionArgsSchema,
} from '@/types/ai-companion';
import { getFoodSubstitutionOptions } from '@/lib/diet-composer/substitution';
import { getExerciseSubstitutionOptions } from '@/lib/workout-engine/substitution';
import { CURATED_EXERCISE_CATALOG } from '@/lib/workout-engine/catalog';
import { DietMealItemSnapshot } from '@/types/diet-plan';
import { NutritionConstraints } from '@/types/nutrition-engine';
import { ComposerCandidateFood } from '@/lib/diet-composer/types';
import { WorkoutConstraints } from '@/types/workout-engine';

export interface ToolDataServices {
  getActiveDietPlan(patientId: string): Promise<unknown>;
  getTodayMeals(patientId: string): Promise<unknown>;
  getActiveWorkoutProgram(patientId: string): Promise<unknown>;
  getTodayWorkout(patientId: string): Promise<unknown>;
  getProgressSummary(patientId: string): Promise<unknown>;
  getDietConstraints(patientId: string): Promise<NutritionConstraints>;
  getFoodItem(
    patientId: string,
    mealId: string,
    foodId: string
  ): Promise<(DietMealItemSnapshot & { item_id: string; plan_id: string; meal_id: string }) | null>;
  getFoodCatalog(): Promise<ComposerCandidateFood[]>;
  getWorkoutConstraints(patientId: string): Promise<WorkoutConstraints | null>;
  recordFeedback(event: {
    patient_id: string;
    conversation_id: string;
    feedback_type: string;
    domain: string;
    target_entity_type?: string;
    target_entity_id?: string;
    intensity_rating?: number;
    notes?: string;
  }): Promise<{ id: string; status: string }>;
  createPendingAction(action: {
    patient_id: string;
    conversation_id: string;
    token: string;
    action_type: string;
    payload: Record<string, unknown>;
    expires_at: Date;
  }): Promise<void>;
  getPendingAction(token: string, patientId: string): Promise<{
    patient_id: string;
    action_type: string;
    payload: Record<string, unknown>;
    expires_at: Date;
    is_consumed: boolean;
    error?: string;
  } | null>;
  completePendingAction(
    token: string,
    patientId: string,
    success: boolean,
    output?: Record<string, unknown>,
    errorMessage?: string
  ): Promise<void>;
  applyDietSubstitution(params: {
    patient_id: string;
    plan_id: string;
    item_id: string;
    meal_id: string;
    current_food_id: string;
    replacement_food_id: string;
    suggested_grams: number;
  }): Promise<{ success: boolean; new_plan_id: string }>;
}

export interface ToolExecutionContext {
  patientId: string;
  conversationId: string;
  dataServices: ToolDataServices;
}

export interface ToolExecutionResult {
  tool_name: AIToolName;
  is_authorized: boolean;
  authorization_denial_reason?: string;
  requires_user_confirmation: boolean;
  confirmation_token?: string;
  output: unknown;
  error?: string;
}

/**
 * Definições oficiais das ferramentas expostas ao LLM.
 */
export const AI_COMPANION_TOOLS: AIProviderToolDefinition[] = [
  {
    name: 'getActiveDietPlan',
    description: 'Consulta o plano alimentar ativo e aprovado do paciente, incluindo metas diárias de calorias e macronutrientes.',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'getTodayMeals',
    description: 'Consulta as refeições programadas para hoje no plano ativo do paciente com seus respectivos alimentos e porções.',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'getFoodSubstitutionOptions',
    description: 'Consulta opções nutricionais equivalentes para substituir um alimento de uma refeição, respeitando alergias e preferências.',
    parameters: {
      type: 'object',
      properties: {
        meal_id: {
          type: 'string',
          description: 'Identificador da refeição do plano ativo que contém o alimento.',
        },
        food_id: {
          type: 'string',
          description: 'Identificador do alimento a ser substituído.',
        },
        current_grams: {
          type: 'number',
          description: 'Quantidade atual em gramas do alimento (opcional).',
        },
      },
      required: ['meal_id', 'food_id'],
    },
  },
  {
    name: 'getActiveWorkoutProgram',
    description: 'Consulta o programa de treino ativo e aprovado do paciente, incluindo divisão semanal e frequência.',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'getTodayWorkout',
    description: 'Consulta a sessão de treino de hoje (ou a próxima sessão programada) com lista de exercícios, séries e repetições.',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'getExerciseSubstitutionOptions',
    description: 'Consulta alternativas biomecânicas válidas e seguras para substituir um exercício do treino atual.',
    parameters: {
      type: 'object',
      properties: {
        exercise_id: {
          type: 'string',
          description: 'Identificador ou código do exercício a ser substituído.',
        },
      },
      required: ['exercise_id'],
    },
  },
  {
    name: 'getProgressSummary',
    description: 'Consulta o histórico de cumprimento e frequência recente do paciente nos treinos.',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'recordUserFeedback',
    description: 'Registra um feedback estruturado do paciente sobre fome, saciedade, tamanho da refeição, desconforto no exercício ou rotina.',
    parameters: {
      type: 'object',
      properties: {
        feedback_type: {
          type: 'string',
          enum: [
            'hunger_satiety',
            'meal_size',
            'taste_dislike',
            'exercise_difficulty',
            'exercise_discomfort',
            'workout_incomplete',
            'schedule_issue',
            'general_comment',
          ],
          description: 'Categoria do feedback relatado.',
        },
        domain: {
          type: 'string',
          enum: ['nutrition', 'workout', 'general'],
          description: 'Domínio do feedback.',
        },
        target_entity_type: {
          type: 'string',
          enum: ['food', 'meal', 'exercise', 'session', 'day', 'program', 'diet_plan'],
          description: 'Entidade alvo do feedback.',
        },
        target_entity_id: {
          type: 'string',
          description: 'Identificador da entidade relacionada (opcional).',
        },
        intensity_rating: {
          type: 'number',
          description: 'Nível de intensidade de 1 a 5 (opcional).',
        },
        notes: {
          type: 'string',
          description: 'Comentário complementar do paciente.',
        },
      },
      required: ['feedback_type', 'domain'],
    },
  },
  {
    name: 'proposeFoodSubstitution',
    description: 'Prepara uma proposta formal de substituição de alimento para que o paciente confirme explicitamente na interface.',
    parameters: {
      type: 'object',
      properties: {
        meal_id: {
          type: 'string',
          description: 'ID da refeição onde a troca ocorrerá.',
        },
        current_food_id: {
          type: 'string',
          description: 'ID do alimento atual a ser removido.',
        },
        replacement_food_id: {
          type: 'string',
          description: 'ID do novo alimento escolhido para substituir.',
        },
      },
      required: ['meal_id', 'current_food_id', 'replacement_food_id'],
    },
  },
  {
    name: 'applyAuthorizedFoodSubstitution',
    description: 'Efetiva uma substituição previamente proposta no plano alimentar após confirmação explícita do usuário.',
    parameters: {
      type: 'object',
      properties: {
        confirmation_token: {
          type: 'string',
          description: 'Token de confirmação de curta duração gerado pelo sistema.',
        },
      },
      required: ['confirmation_token'],
    },
  },
];

/**
 * Executor seguro de ferramentas com autorização rigorosa no servidor.
 */
export async function executeAITool(
  toolName: string,
  rawArguments: Record<string, unknown>,
  context: ToolExecutionContext
): Promise<ToolExecutionResult> {
  const patientId = context.patientId;
  const conversationId = context.conversationId;

  try {
    switch (toolName as AIToolName) {
      case 'getActiveDietPlan': {
        const plan = await context.dataServices.getActiveDietPlan(patientId);
        return {
          tool_name: 'getActiveDietPlan',
          is_authorized: true,
          requires_user_confirmation: false,
          output: plan,
        };
      }

      case 'getTodayMeals': {
        const meals = await context.dataServices.getTodayMeals(patientId);
        return {
          tool_name: 'getTodayMeals',
          is_authorized: true,
          requires_user_confirmation: false,
          output: meals,
        };
      }

      case 'getFoodSubstitutionOptions': {
        const parsed = GetFoodSubstitutionArgsSchema.parse(rawArguments);
        const foodItem = await context.dataServices.getFoodItem(patientId, parsed.meal_id, parsed.food_id);

        if (!foodItem) {
          return {
            tool_name: 'getFoodSubstitutionOptions',
            is_authorized: true,
            requires_user_confirmation: false,
            output: { options: [], message: 'Alimento não encontrado no plano do paciente.' },
          };
        }

        const constraints = await context.dataServices.getDietConstraints(patientId);
        const catalog = await context.dataServices.getFoodCatalog();
        const options = getFoodSubstitutionOptions(foodItem, constraints, catalog);

        return {
          tool_name: 'getFoodSubstitutionOptions',
          is_authorized: true,
          requires_user_confirmation: false,
          output: {
            current_food: {
              food_id: foodItem.food_id,
              name: foodItem.food_name,
              grams: foodItem.grams,
              energy_kcal: foodItem.energy_kcal,
              protein_g: foodItem.protein_g,
            },
            options: options.slice(0, 5), // Top 5 alternativas seguras
          },
        };
      }

      case 'getActiveWorkoutProgram': {
        const prog = await context.dataServices.getActiveWorkoutProgram(patientId);
        return {
          tool_name: 'getActiveWorkoutProgram',
          is_authorized: true,
          requires_user_confirmation: false,
          output: prog,
        };
      }

      case 'getTodayWorkout': {
        const workout = await context.dataServices.getTodayWorkout(patientId);
        return {
          tool_name: 'getTodayWorkout',
          is_authorized: true,
          requires_user_confirmation: false,
          output: workout,
        };
      }

      case 'getExerciseSubstitutionOptions': {
        const parsed = GetExerciseSubstitutionArgsSchema.parse(rawArguments);
        const original = CURATED_EXERCISE_CATALOG.find(
          (e) => e.id === parsed.exercise_id || e.code === parsed.exercise_id
        );

        if (!original) {
          return {
            tool_name: 'getExerciseSubstitutionOptions',
            is_authorized: true,
            requires_user_confirmation: false,
            output: { options: [], message: 'Exercício não encontrado no catálogo biomecânico.' },
          };
        }

        const constraints = await context.dataServices.getWorkoutConstraints(patientId);
        if (!constraints) {
          return {
            tool_name: 'getExerciseSubstitutionOptions',
            is_authorized: false,
            authorization_denial_reason: 'As restrições de treino do paciente não estão persistidas em formato verificável.',
            requires_user_confirmation: false,
            output: { options: [], message: 'A substituição de exercício requer revisão profissional no momento.' },
            error: 'WORKOUT_CONSTRAINTS_UNAVAILABLE',
          };
        }
        const options = getExerciseSubstitutionOptions(original, constraints, CURATED_EXERCISE_CATALOG);
        const enrichedOptions = options.map((opt) => {
          const matched = CURATED_EXERCISE_CATALOG.find((c) => c.id === opt.exercise_id);
          return {
            ...opt,
            code: matched?.code,
          };
        });

        return {
          tool_name: 'getExerciseSubstitutionOptions',
          is_authorized: true,
          requires_user_confirmation: false,
          output: {
            original_exercise: {
              id: original.id,
              code: original.code,
              name: original.name,
              movement_pattern: original.movement_pattern,
            },
            options: enrichedOptions.slice(0, 4), // Top alternativas
          },
        };
      }

      case 'getProgressSummary': {
        const progress = await context.dataServices.getProgressSummary(patientId);
        return {
          tool_name: 'getProgressSummary',
          is_authorized: true,
          requires_user_confirmation: false,
          output: progress,
        };
      }

      case 'recordUserFeedback': {
        const parsed = RecordFeedbackArgsSchema.parse(rawArguments);
        const recorded = await context.dataServices.recordFeedback({
          patient_id: patientId,
          conversation_id: conversationId,
          feedback_type: parsed.feedback_type,
          domain: parsed.domain,
          target_entity_type: parsed.target_entity_type,
          target_entity_id: parsed.target_entity_id,
          intensity_rating: parsed.intensity_rating,
          notes: parsed.notes,
        });

        return {
          tool_name: 'recordUserFeedback',
          is_authorized: true,
          requires_user_confirmation: false,
          output: {
            success: true,
            feedback_id: recorded.id,
            message: 'Feedback registrado com sucesso. Essas informações serão consideradas pelo nutricionista e motor de evolução.',
          },
        };
      }

      case 'proposeFoodSubstitution': {
        const parsed = ProposeFoodSubstitutionArgsSchema.parse(rawArguments);
        const foodItem = await context.dataServices.getFoodItem(
          patientId,
          parsed.meal_id,
          parsed.current_food_id
        );

        if (!foodItem) {
          return {
            tool_name: 'proposeFoodSubstitution',
            is_authorized: false,
            authorization_denial_reason: 'Alimento original não encontrado no plano.',
            requires_user_confirmation: false,
            output: null,
            error: 'FOOD_NOT_FOUND',
          };
        }

        const constraints = await context.dataServices.getDietConstraints(patientId);
        const catalog = await context.dataServices.getFoodCatalog();
        const options = getFoodSubstitutionOptions(foodItem, constraints, catalog);

        const chosenOption = options.find((o) => o.food_id === parsed.replacement_food_id);
        if (!chosenOption) {
          return {
            tool_name: 'proposeFoodSubstitution',
            is_authorized: false,
            authorization_denial_reason: 'Alimento substituto não é nutricionalmente compatível ou viola alergias do paciente.',
            requires_user_confirmation: false,
            output: null,
            error: 'INCOMPATIBLE_SUBSTITUTION',
          };
        }

        // Gera token de confirmação seguro com TTL de 15 minutos
        const confirmationToken = `act_${crypto.randomBytes(16).toString('hex')}`;
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

        await context.dataServices.createPendingAction({
          patient_id: patientId,
          conversation_id: conversationId,
          token: confirmationToken,
          action_type: 'food_substitution',
          payload: {
            plan_id: foodItem.plan_id,
            item_id: foodItem.item_id,
            meal_id: parsed.meal_id,
            current_food_id: parsed.current_food_id,
            replacement_food_id: parsed.replacement_food_id,
            suggested_grams: chosenOption.suggested_grams,
            food_name_from: foodItem.food_name,
            food_name_to: chosenOption.food_name,
            delta_kcal: chosenOption.nutrition_delta.delta_kcal,
            delta_protein_g: chosenOption.nutrition_delta.delta_protein_g,
          },
          expires_at: expiresAt,
        });

        return {
          tool_name: 'proposeFoodSubstitution',
          is_authorized: true,
          requires_user_confirmation: true,
          confirmation_token: confirmationToken,
          output: {
            pending_action: true,
            confirmation_token: confirmationToken,
            expires_at: expiresAt.toISOString(),
            details: {
              from: `${foodItem.food_name} (${foodItem.grams}g)`,
              to: `${chosenOption.food_name} (${chosenOption.suggested_grams}g)`,
              delta_kcal: chosenOption.nutrition_delta.delta_kcal,
              delta_protein_g: chosenOption.nutrition_delta.delta_protein_g,
            },
            message: `Para trocar ${foodItem.food_name} por ${chosenOption.food_name} (${chosenOption.suggested_grams}g), por favor confirme a ação na tela.`,
          },
        };
      }

      case 'applyAuthorizedFoodSubstitution': {
        const parsed = ApplyAuthorizedFoodSubstitutionArgsSchema.parse(rawArguments);
        const action = await context.dataServices.getPendingAction(parsed.confirmation_token, patientId);

        if (!action) {
          return {
            tool_name: 'applyAuthorizedFoodSubstitution',
            is_authorized: false,
            authorization_denial_reason: 'Token de confirmação inexistente ou inválido.',
            requires_user_confirmation: false,
            output: null,
            error: 'INVALID_CONFIRMATION_TOKEN',
          };
        }

        if (action.error) {
          return {
            tool_name: 'applyAuthorizedFoodSubstitution',
            is_authorized: false,
            authorization_denial_reason: 'A confirmação não pôde ser reivindicada com segurança.',
            requires_user_confirmation: false,
            output: null,
            error: action.error,
          };
        }

        // Validação estrita de ownership: o token DEVE pertencer ao paciente da sessão
        if (action.patient_id !== patientId) {
          return {
            tool_name: 'applyAuthorizedFoodSubstitution',
            is_authorized: false,
            authorization_denial_reason: 'Tentativa de confirmação de ação pertencente a outro paciente (bloqueio cross-tenant).',
            requires_user_confirmation: false,
            output: null,
            error: 'CROSS_TENANT_ACTION_BLOCKED',
          };
        }

        if (action.is_consumed) {
          return {
            tool_name: 'applyAuthorizedFoodSubstitution',
            is_authorized: false,
            authorization_denial_reason: 'Ação já foi consumida anteriormente.',
            requires_user_confirmation: false,
            output: null,
            error: 'ACTION_ALREADY_CONSUMED',
          };
        }

        if (new Date() > action.expires_at) {
          return {
            tool_name: 'applyAuthorizedFoodSubstitution',
            is_authorized: false,
            authorization_denial_reason: 'O tempo limite de 15 minutos para confirmação expirou.',
            requires_user_confirmation: false,
            output: null,
            error: 'CONFIRMATION_EXPIRED',
          };
        }

        const payload = action.payload as {
          plan_id: string;
          item_id: string;
          meal_id: string;
          current_food_id: string;
          replacement_food_id: string;
          suggested_grams: number;
        };

        let result: { success: boolean; new_plan_id: string };
        try {
          result = await context.dataServices.applyDietSubstitution({
            patient_id: patientId,
            plan_id: payload.plan_id,
            item_id: payload.item_id,
            meal_id: payload.meal_id,
            current_food_id: payload.current_food_id,
            replacement_food_id: payload.replacement_food_id,
            suggested_grams: payload.suggested_grams,
          });
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : 'Falha desconhecida ao versionar o plano.';
          await context.dataServices.completePendingAction(
            parsed.confirmation_token,
            patientId,
            false,
            undefined,
            message
          );
          return {
            tool_name: 'applyAuthorizedFoodSubstitution',
            is_authorized: false,
            authorization_denial_reason: 'A nova versão do plano não pôde ser criada.',
            requires_user_confirmation: false,
            output: null,
            error: 'VERSIONED_SUBSTITUTION_FAILED',
          };
        }

        await context.dataServices.completePendingAction(
          parsed.confirmation_token,
          patientId,
          true,
          { new_plan_id: result.new_plan_id }
        );

        return {
          tool_name: 'applyAuthorizedFoodSubstitution',
          is_authorized: true,
          requires_user_confirmation: false,
          output: {
            success: true,
            new_plan_id: result.new_plan_id,
            message: 'Substituição realizada com sucesso no plano alimentar ativo.',
          },
        };
      }

      default:
        return {
          tool_name: toolName as AIToolName,
          is_authorized: false,
          authorization_denial_reason: `Ferramenta desconhecida ou não registrada: ${toolName}`,
          requires_user_confirmation: false,
          output: null,
          error: 'UNKNOWN_TOOL',
        };
    }
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      tool_name: toolName as AIToolName,
      is_authorized: false,
      authorization_denial_reason: `Erro de validação de argumentos: ${errorMsg}`,
      requires_user_confirmation: false,
      output: null,
      error: 'ARGUMENT_VALIDATION_FAILED',
    };
  }
}
