/**
 * Configurações e Guardrails Operacionais do Motor de Precificação (Versionado).
 *
 * Os limites de idade e confiança são regras operacionais do sistema,
 * sujeitas a evolução versionada, e não verdades universais.
 */

export const PRICE_ENGINE_VERSION = '1.0.0';
export const PRICE_FRESHNESS_CONFIG_VERSION = '1.0.0';

export const PRICE_CONFIG = {
  ENGINE_VERSION: PRICE_ENGINE_VERSION,
  FRESHNESS_CONFIG_VERSION: PRICE_FRESHNESS_CONFIG_VERSION,
  DEFAULT_CURRENCY: 'BRL',
  THRESHOLDS: {
    FRESH_DAYS: 30, // <= 30 dias: fresh
    AGING_DAYS: 90, // 31 a 90 dias: aging; > 90 dias: stale
  },
  LEVEL_WEIGHTS: {
    city: 1.0,
    state: 0.85,
    national: 0.7,
    unknown: 0.0,
  },
  FRESHNESS_WEIGHTS: {
    fresh: 1.0,
    aging: 0.8,
    stale: 0.5,
    unknown: 0.0,
  },
} as const;

export type PriceSourceLevel = 'city' | 'state' | 'national' | 'unknown';
