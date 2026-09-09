/**
 * Rate Limiting & Governança de Abuso do AI Companion (ETAPA 8)
 * Previne loops de ferramentas, custos abusivos de tokens e negação de serviço.
 */

export interface RateLimitStatus {
  allowed: boolean;
  remainingMessages: number;
  resetSeconds: number;
  reason?: string;
}

export interface RateLimitStore {
  getCounts(patientId: string): Promise<{ messageCount: number; windowStartMs: number }>;
  increment(patientId: string): Promise<void>;
  reset(patientId: string): Promise<void>;
}

export const RATE_LIMIT_CONFIG = {
  MAX_MESSAGES_PER_WINDOW: 20,
  WINDOW_DURATION_MS: 10 * 60 * 1000, // 10 minutos
  MAX_TOOL_CALLS_PER_TURN: 3,
  MAX_TOOL_IDENTICAL_REPETITIONS: 2,
  MAX_INPUT_CHARS: 1000,
  AI_REQUEST_TIMEOUT_MS: 15000, // 15 segundos
};

/**
 * Armazenamento em memória padrão (usado em testes e fallback).
 */
export class InMemoryRateLimitStore implements RateLimitStore {
  private records = new Map<string, { count: number; windowStart: number }>();

  public async getCounts(patientId: string): Promise<{ messageCount: number; windowStartMs: number }> {
    const now = Date.now();
    const entry = this.records.get(patientId);

    if (!entry || now - entry.windowStart >= RATE_LIMIT_CONFIG.WINDOW_DURATION_MS) {
      return { messageCount: 0, windowStartMs: now };
    }

    return { messageCount: entry.count, windowStartMs: entry.windowStart };
  }

  public async increment(patientId: string): Promise<void> {
    const now = Date.now();
    const entry = this.records.get(patientId);

    if (!entry || now - entry.windowStart >= RATE_LIMIT_CONFIG.WINDOW_DURATION_MS) {
      this.records.set(patientId, { count: 1, windowStart: now });
    } else {
      entry.count += 1;
    }
  }

  public async reset(patientId: string): Promise<void> {
    this.records.delete(patientId);
  }
}

/**
 * Verificador de taxa de requisições por paciente.
 */
export class AIRateLimiter {
  constructor(private store: RateLimitStore = new InMemoryRateLimitStore()) {}

  public async checkRateLimit(patientId: string): Promise<RateLimitStatus> {
    const { messageCount, windowStartMs } = await this.store.getCounts(patientId);
    const now = Date.now();
    const elapsed = now - windowStartMs;
    const remainingMs = Math.max(0, RATE_LIMIT_CONFIG.WINDOW_DURATION_MS - elapsed);
    const resetSeconds = Math.ceil(remainingMs / 1000);

    if (messageCount >= RATE_LIMIT_CONFIG.MAX_MESSAGES_PER_WINDOW) {
      return {
        allowed: false,
        remainingMessages: 0,
        resetSeconds,
        reason: `Limite de ${RATE_LIMIT_CONFIG.MAX_MESSAGES_PER_WINDOW} mensagens atingido. Tente novamente em ${resetSeconds} segundos.`,
      };
    }

    return {
      allowed: true,
      remainingMessages: RATE_LIMIT_CONFIG.MAX_MESSAGES_PER_WINDOW - messageCount,
      resetSeconds,
    };
  }

  public async recordMessage(patientId: string): Promise<void> {
    await this.store.increment(patientId);
  }

  /**
   * Detecta se o modelo entrou em loop chamando a mesma ferramenta com os mesmos argumentos.
   */
  public static detectToolLoop(
    toolHistory: { toolName: string; argumentsJson: string }[],
    newCall: { toolName: string; argumentsJson: string }
  ): boolean {
    const identicalCount = toolHistory.filter(
      (h) => h.toolName === newCall.toolName && h.argumentsJson === newCall.argumentsJson
    ).length;

    return identicalCount >= RATE_LIMIT_CONFIG.MAX_TOOL_IDENTICAL_REPETITIONS;
  }
}
