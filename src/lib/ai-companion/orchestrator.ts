/**
 * AI Companion Orchestrator — Pipeline Unidirecional e Seguro (ETAPA 8)
 * Coordena SafetyClassifier, ContextBuilder, AIProvider, Tool Registry,
 * Auditoria e Fail-Closed.
 */

import {
  AIProvider,
  AIProviderMessage,
} from '@/types/ai-companion';
import { classifyInputSafety } from './safety';
import { AIContextBuilder, ContextDataSource } from './context-builder';
import { AI_COMPANION_TOOLS, executeAITool, ToolExecutionContext, ToolExecutionResult } from './tools';
import { AIRateLimiter, RATE_LIMIT_CONFIG } from './rate-limiter';

export interface OrchestratorDependencies {
  provider: AIProvider;
  contextDataSource: ContextDataSource;
  rateLimiter: AIRateLimiter;
  toolDataServices: ToolExecutionContext['dataServices'];
  // Persistência de mensagens
  messageStore?: {
    saveMessage(msg: {
      conversation_id: string;
      patient_id: string;
      role: string;
      content: string;
      tool_calls?: unknown;
      tool_call_id?: string;
      safety_flags?: string[];
      tokens_used?: number;
    }): Promise<string>;
    recordToolExecution(exec: {
      patient_id: string;
      conversation_id: string;
      tool_name: string;
      input_arguments: Record<string, unknown>;
      is_authorized: boolean;
      authorization_denial_reason?: string;
      requires_user_confirmation: boolean;
      confirmation_status: string;
      confirmation_token?: string;
      execution_status: string;
      output_payload?: unknown;
      error_message?: string;
    }): Promise<string>;
  };
}

export interface OrchestrationResult {
  success: boolean;
  content: string;
  conversation_id: string;
  safety_flags: string[];
  blocked_by_safety: boolean;
  tool_executions: ToolExecutionResult[];
  requires_confirmation: boolean;
  confirmation_token?: string;
  confirmation_details?: unknown;
  error?: string;
}

export class AICompanionOrchestrator {
  constructor(private deps: OrchestratorDependencies) {}

  public async processMessage(params: {
    patientId: string;
    conversationId: string;
    userMessage: string;
  }): Promise<OrchestrationResult> {
    const { patientId, conversationId, userMessage } = params;

    try {
      // 1. Validação de tamanho da mensagem de entrada
      if (!userMessage || userMessage.trim().length === 0) {
        return {
          success: false,
          content: 'Por favor, envie uma mensagem com texto válido.',
          conversation_id: conversationId,
          safety_flags: [],
          blocked_by_safety: false,
          tool_executions: [],
          requires_confirmation: false,
        };
      }

      if (userMessage.length > RATE_LIMIT_CONFIG.MAX_INPUT_CHARS) {
        return {
          success: false,
          content: `Sua mensagem excedeu o limite máximo de ${RATE_LIMIT_CONFIG.MAX_INPUT_CHARS} caracteres. Por favor, seja mais conciso.`,
          conversation_id: conversationId,
          safety_flags: ['input_length_exceeded'],
          blocked_by_safety: true,
          tool_executions: [],
          requires_confirmation: false,
        };
      }

      // 2. Verificação de Rate Limiting
      const rateStatus = await this.deps.rateLimiter.checkRateLimit(patientId);
      if (!rateStatus.allowed) {
        return {
          success: false,
          content: rateStatus.reason ?? 'Limite de mensagens atingido. Tente novamente mais tarde.',
          conversation_id: conversationId,
          safety_flags: ['rate_limit_exceeded'],
          blocked_by_safety: true,
          tool_executions: [],
          requires_confirmation: false,
        };
      }

      // 3. Pre-LLM Safety Classifier (Princípio SYMPTOM != DIAGNOSIS & Emergências)
      const safetyResult = classifyInputSafety(userMessage);

      if (safetyResult.block_llm && safetyResult.safe_response_override) {
        // Registra mensagem do usuário e resposta de segurança no histórico se disponível
        if (this.deps.messageStore) {
          await this.deps.messageStore.saveMessage({
            conversation_id: conversationId,
            patient_id: patientId,
            role: 'user',
            content: userMessage,
            safety_flags: safetyResult.flags,
          });
          await this.deps.messageStore.saveMessage({
            conversation_id: conversationId,
            patient_id: patientId,
            role: 'assistant',
            content: safetyResult.safe_response_override,
            safety_flags: safetyResult.flags,
          });
        }

        await this.deps.rateLimiter.recordMessage(patientId);

        return {
          success: true,
          content: safetyResult.safe_response_override,
          conversation_id: conversationId,
          safety_flags: safetyResult.flags,
          blocked_by_safety: true,
          tool_executions: [],
          requires_confirmation: false,
        };
      }

      // 4. Constrói Contexto Mínimo Scoped
      const contextBuilder = new AIContextBuilder(this.deps.contextDataSource);
      const contextAggregate = await contextBuilder.buildContext(patientId, conversationId);
      const systemPrompt = AIContextBuilder.formatSystemPrompt(contextAggregate);

      // 5. Monta sequência de mensagens para o Provedor
      const providerMessages: AIProviderMessage[] = [
        { role: 'system', content: systemPrompt },
        ...contextAggregate.conversation.recent_messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        { role: 'user', content: userMessage },
      ];

      // Salva mensagem do usuário
      if (this.deps.messageStore) {
        await this.deps.messageStore.saveMessage({
          conversation_id: conversationId,
          patient_id: patientId,
          role: 'user',
          content: userMessage,
          safety_flags: safetyResult.flags,
        });
      }

      // 6. Chamada ao Provedor de IA com loop de ferramentas
      let currentIteration = 0;
      const toolExecutions: ToolExecutionResult[] = [];
      const toolHistory: { toolName: string; argumentsJson: string }[] = [];
      let finalContent = '';
      let requiresConfirmation = false;
      let confirmationToken: string | undefined;
      let confirmationDetails: unknown;

      const toolExecutionContext: ToolExecutionContext = {
        patientId,
        conversationId,
        dataServices: this.deps.toolDataServices,
      };

      while (currentIteration < RATE_LIMIT_CONFIG.MAX_TOOL_CALLS_PER_TURN) {
        currentIteration++;

        const response = await this.deps.provider.generate(providerMessages, AI_COMPANION_TOOLS, {
          temperature: 0.2,
          maxTokens: 800,
        });

        // Se o modelo respondeu texto sem ferramentas
        if (!response.tool_calls || response.tool_calls.length === 0) {
          finalContent = response.content ?? 'Como posso te ajudar mais com seu plano hoje?';
          break;
        }

        // Processa chamadas de ferramenta
        for (const toolCall of response.tool_calls) {
          const toolName = toolCall.function.name;
          const argsJson = toolCall.function.arguments;

          // Detecção de loop
          if (AIRateLimiter.detectToolLoop(toolHistory, { toolName, argumentsJson: argsJson })) {
            finalContent = 'Detectei uma repetição na consulta dos seus dados. Como posso te orientar diretamente agora?';
            break;
          }

          toolHistory.push({ toolName, argumentsJson: argsJson });

          let parsedArgs: Record<string, unknown> = {};
          try {
            parsedArgs = JSON.parse(argsJson);
          } catch {
            parsedArgs = {};
          }

          const executionResult = await executeAITool(toolName, parsedArgs, toolExecutionContext);
          toolExecutions.push(executionResult);

          if (this.deps.messageStore) {
            await this.deps.messageStore.recordToolExecution({
              patient_id: patientId,
              conversation_id: conversationId,
              tool_name: toolName,
              input_arguments: parsedArgs,
              is_authorized: executionResult.is_authorized,
              authorization_denial_reason: executionResult.authorization_denial_reason,
              requires_user_confirmation: executionResult.requires_user_confirmation,
              confirmation_status: executionResult.requires_user_confirmation ? 'pending' : 'not_required',
              confirmation_token: executionResult.confirmation_token,
              execution_status: executionResult.is_authorized
                ? executionResult.requires_user_confirmation
                  ? 'pending_confirmation'
                  : 'success'
                : 'blocked_auth',
              output_payload: executionResult.output,
              error_message: executionResult.error,
            });
          }

          if (executionResult.requires_user_confirmation) {
            requiresConfirmation = true;
            confirmationToken = executionResult.confirmation_token;
            confirmationDetails = executionResult.output;
          }

          // Alimenta o resultado de volta ao contexto para a próxima iteração
          providerMessages.push({
            role: 'assistant',
            content: response.content ?? '',
            tool_calls: [toolCall],
          });

          providerMessages.push({
            role: 'tool',
            content: JSON.stringify(executionResult.output ?? { error: executionResult.error }),
            tool_call_id: toolCall.id,
          });
        }

        // Se uma ação exigiu confirmação explícita do usuário, encerramos o loop de tools para aguardar o clique
        if (requiresConfirmation) {
          const lastProposal = toolExecutions.find((t) => t.tool_name === 'proposeFoodSubstitution');
          const detailsMsg = (lastProposal?.output as { message?: string })?.message;
          finalContent = detailsMsg ?? 'Substituição proposta pronta. Por favor, confirme a alteração na tela para efetivar no seu plano.';
          break;
        }
      }

      // Se estourou o limite de iterações sem texto final
      if (!finalContent) {
        finalContent = 'Informações consultadas com sucesso no seu plano. Deseja mais detalhes sobre algum item?';
      }

      // Salva mensagem do assistente
      if (this.deps.messageStore) {
        await this.deps.messageStore.saveMessage({
          conversation_id: conversationId,
          patient_id: patientId,
          role: 'assistant',
          content: finalContent,
          safety_flags: safetyResult.flags,
        });
      }

      await this.deps.rateLimiter.recordMessage(patientId);

      return {
        success: true,
        content: finalContent,
        conversation_id: conversationId,
        safety_flags: safetyResult.flags,
        blocked_by_safety: false,
        tool_executions: toolExecutions,
        requires_confirmation: requiresConfirmation,
        confirmation_token: confirmationToken,
        confirmation_details: confirmationDetails,
      };
    } catch (err: unknown) {
      // FAIL CLOSED: Em caso de erro do provedor, timeout ou exceção interna,
      // retorna resposta segura e amigável sem corromper ou mutar dados.
      const errorMsg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        content: 'Desculpe, tive uma instabilidade temporária para processar sua solicitação com segurança. Por favor, tente novamente em instantes.',
        conversation_id: conversationId,
        safety_flags: ['system_error_fail_closed'],
        blocked_by_safety: true,
        tool_executions: [],
        requires_confirmation: false,
        error: errorMsg,
      };
    }
  }
}
