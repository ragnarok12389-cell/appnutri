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
  consume(
    patientId: string,
    maxMessages: number,
    windowDurationMs: number
  ): Promise<{ allowed: boolean; messageCount: number; windowStartMs: number }>;
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

  public async consume(
    patientId: string,
    maxMessages: number,
    windowDurationMs: number
  ): Promise<{ allowed: boolean; messageCount: number; windowStartMs: number }> {
    const now = Date.now();
    const entry = this.records.get(patientId);

    if (!entry || now - entry.windowStart >= windowDurationMs) {
      this.records.set(patientId, { count: 1, windowStart: now });
      return { allowed: true, messageCount: 1, windowStartMs: now };
    }

    if (entry.count >= maxMessages) {
      return { allowed: false, messageCount: entry.count, windowStartMs: entry.windowStart };
    }

    entry.count += 1;
    return { allowed: true, messageCount: entry.count, windowStartMs: entry.windowStart };
  }

  public async reset(patientId: string): Promise<void> {
    this.records.delete(patientId);
  }
}

interface RateLimitRpcRow {
  allowed: boolean;
  message_count: number;
  window_started_at: string;
}

/**
 * Armazenamento persistente usado pelas rotas reais. A decisão e o incremento
 * acontecem na mesma transação PostgreSQL para evitar estouro por concorrência.
 */
export class SupabaseRateLimitStore implements RateLimitStore {
  constructor(private readonly supabase: SupabaseClient) {}

  public async consume(
    patientId: string,
    maxMessages: number,
    windowDurationMs: number
  ): Promise<{ allowed: boolean; messageCount: number; windowStartMs: number }> {
    const { data, error } = await this.supabase.rpc('consume_ai_rate_limit', {
      p_patient_id: patientId,
      p_max_messages: maxMessages,
      p_window_seconds: Math.ceil(windowDurationMs / 1000),
    });

    if (error) {
      throw new Error(`Falha ao verificar limite persistente do Companion: ${error.message}`);
    }

    const raw = Array.isArray(data) ? data[0] : data;
    const row = raw as RateLimitRpcRow | null;
    if (!row || typeof row.allowed !== 'boolean') {
      throw new Error('Resposta inválida do controle persistente de limite do Companion.');
    }

    return {
      allowed: row.allowed,
      messageCount: Number(row.message_count),
      windowStartMs: new Date(row.window_started_at).getTime(),
    };
  }

  public async reset(patientId: string): Promise<void> {
    const { error } = await this.supabase.from('ai_rate_limits').delete().eq('patient_id', patientId);
    if (error) {
      throw new Error(`Falha ao reiniciar limite persistente do Companion: ${error.message}`);
    }
  }
}

/**
 * Verificador de taxa de requisições por paciente.
 */
export class AIRateLimiter {
  constructor(private store: RateLimitStore = new InMemoryRateLimitStore()) {}

  public async checkRateLimit(patientId: string): Promise<RateLimitStatus> {
    const { allowed, messageCount, windowStartMs } = await this.store.consume(
      patientId,
      RATE_LIMIT_CONFIG.MAX_MESSAGES_PER_WINDOW,
      RATE_LIMIT_CONFIG.WINDOW_DURATION_MS
    );
    const now = Date.now();
    const elapsed = now - windowStartMs;
    const remainingMs = Math.max(0, RATE_LIMIT_CONFIG.WINDOW_DURATION_MS - elapsed);
    const resetSeconds = Math.ceil(remainingMs / 1000);

    if (!allowed) {
      return {
        allowed: false,
        remainingMessages: 0,
        resetSeconds,
        reason: `Limite de ${RATE_LIMIT_CONFIG.MAX_MESSAGES_PER_WINDOW} mensagens atingido. Tente novamente em ${resetSeconds} segundos.`,
      };
    }

    return {
      allowed: true,
      remainingMessages: Math.max(0, RATE_LIMIT_CONFIG.MAX_MESSAGES_PER_WINDOW - messageCount),
      resetSeconds,
    };
  }

  public async recordMessage(patientId: string): Promise<void> {
    await this.store.consume(
      patientId,
      RATE_LIMIT_CONFIG.MAX_MESSAGES_PER_WINDOW,
      RATE_LIMIT_CONFIG.WINDOW_DURATION_MS
    );
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
import type { SupabaseClient } from '@supabase/supabase-js';
