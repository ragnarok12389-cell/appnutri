/**
 * Provider Abstraction para o AI Companion (ETAPA 8)
 * Desacoplamento total de fornecedor (Gemini, OpenAI, Mock local).
 * ZERO vendor lock-in e facilidade absoluta de testes automatizados sem rede.
 */

import {
  AIProvider,
  AIProviderMessage,
  AIProviderToolDefinition,
  AIProviderResponse,
  AIToolCall,
} from '@/types/ai-companion';

/**
 * MockAIProvider para testes automatizados determinísticos, CI/CD e simulação de falhas.
 */
export class MockAIProvider implements AIProvider {
  public readonly providerName = 'mock';
  public readonly modelName = 'mock-companion-v1';

  private mockResponseHandler?: (
    messages: AIProviderMessage[],
    tools?: AIProviderToolDefinition[]
  ) => Promise<AIProviderResponse> | AIProviderResponse;

  constructor(
    handler?: (
      messages: AIProviderMessage[],
      tools?: AIProviderToolDefinition[]
    ) => Promise<AIProviderResponse> | AIProviderResponse
  ) {
    this.mockResponseHandler = handler;
  }

  public setHandler(
    handler: (
      messages: AIProviderMessage[],
      tools?: AIProviderToolDefinition[]
    ) => Promise<AIProviderResponse> | AIProviderResponse
  ): void {
    this.mockResponseHandler = handler;
  }

  public async generate(
    messages: AIProviderMessage[],
    tools?: AIProviderToolDefinition[]
  ): Promise<AIProviderResponse> {
    if (this.mockResponseHandler) {
      return await this.mockResponseHandler(messages, tools);
    }

    // Comportamento padrão: resposta conversacional simples
    const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user');
    const content = lastUserMsg
      ? `Compreendi sua mensagem sobre "${lastUserMsg.content}". Como posso te ajudar mais com seu plano hoje?`
      : 'Olá! Como posso te apoiar no seu plano de nutrição e treino hoje?';

    return {
      content,
      finish_reason: 'stop',
      usage: {
        prompt_tokens: 50,
        completion_tokens: 30,
        total_tokens: 80,
      },
    };
  }
}

/**
 * GeminiAIProvider conectando com a API oficial do Google Gemini via REST server-side.
 */
export class GeminiAIProvider implements AIProvider {
  public readonly providerName = 'gemini';
  public readonly modelName: string;
  private apiKey: string;

  constructor(apiKey?: string, modelName: string = 'gemini-1.5-flash') {
    this.apiKey = apiKey ?? process.env.GEMINI_API_KEY ?? '';
    this.modelName = modelName;
  }

  public async generate(
    messages: AIProviderMessage[],
    tools?: AIProviderToolDefinition[],
    options?: { temperature?: number; maxTokens?: number }
  ): Promise<AIProviderResponse> {
    if (!this.apiKey) {
      throw new Error('GEMINI_API_KEY não configurada no ambiente do servidor.');
    }

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${this.modelName}:generateContent?key=${this.apiKey}`;

    // Mapeamento de mensagens para formato Gemini
    const contents = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));

    const systemMsg = messages.find((m) => m.role === 'system');
    const systemInstruction = systemMsg ? { parts: [{ text: systemMsg.content }] } : undefined;

    // Mapeamento de tools
    const geminiTools = tools && tools.length > 0
      ? [
          {
            functionDeclarations: tools.map((t) => ({
              name: t.name,
              description: t.description,
              parameters: t.parameters,
            })),
          },
        ]
      : undefined;

    const payload = {
      systemInstruction,
      contents,
      tools: geminiTools,
      generationConfig: {
        temperature: options?.temperature ?? 0.2,
        maxOutputTokens: options?.maxTokens ?? 800,
      },
    };

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Gemini API error (${res.status}): ${errorText}`);
    }

    const data = await res.json();
    const candidate = data.candidates?.[0];
    if (!candidate) {
      return { content: null, finish_reason: 'error' };
    }

    const textPart = candidate.content?.parts?.find((p: { text?: string }) => p.text);
    const functionCallPart = candidate.content?.parts?.find(
      (p: { functionCall?: { name: string; args: Record<string, unknown> } }) => p.functionCall
    );

    let toolCalls: AIToolCall[] | undefined;
    if (functionCallPart?.functionCall) {
      toolCalls = [
        {
          id: `call_${Date.now()}`,
          type: 'function',
          function: {
            name: functionCallPart.functionCall.name,
            arguments: JSON.stringify(functionCallPart.functionCall.args ?? {}),
          },
        },
      ];
    }

    return {
      content: textPart?.text ?? null,
      tool_calls: toolCalls,
      finish_reason: toolCalls ? 'tool_calls' : 'stop',
      usage: {
        prompt_tokens: data.usageMetadata?.promptTokenCount ?? 0,
        completion_tokens: data.usageMetadata?.candidatesTokenCount ?? 0,
        total_tokens: data.usageMetadata?.totalTokenCount ?? 0,
      },
    };
  }
}

/**
 * Factory padrão para resolver o AIProvider configurado no ambiente.
 */
export function getAIProvider(): AIProvider {
  if (process.env.NODE_ENV === 'test' || !process.env.GEMINI_API_KEY) {
    return new MockAIProvider();
  }
  return new GeminiAIProvider();
}
