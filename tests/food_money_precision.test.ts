import { describe, it, expect } from 'vitest';
import {
  addMoney,
  subtractMoney,
  multiplyMoney,
  divideMoney,
  roundMoney,
  calculateNormalizedPriceSafe,
  calculatePortionCostSafe,
} from '../src/lib/foods/money';
import {
  getFoodPriceEstimate,
} from '../src/lib/foods/pricing';
import { PRICE_ENGINE_VERSION } from '../src/lib/foods/pricing-config';
import { FoodPriceObservation } from '../src/types/food';

describe('ETAPA 5: Precisão Monetária e Price Engine Versionado', () => {
  describe('1. Aritmética Financeira Segura (Módulo money.ts)', () => {
    it('deve somar 0.1 + 0.2 resultando exatamente 0.30 sem imprecisão de ponto flutuante', () => {
      // Clássico bug JS: 0.1 + 0.2 === 0.30000000000000004
      expect(0.1 + 0.2).not.toBe(0.3);
      expect(addMoney(0.1, 0.2)).toBe(0.3);
    });

    it('deve realizar operações sucessivas sem drift cumulativo', () => {
      let total = 0.0;
      for (let i = 0; i < 10; i++) {
        total = addMoney(total, 0.1);
      }
      expect(total).toBe(1.0);

      let subTotal = 1.0;
      for (let i = 0; i < 10; i++) {
        subTotal = subtractMoney(subTotal, 0.1);
      }
      expect(subTotal).toBe(0.0);
    });

    it('deve multiplicar e arredondar valores monetários sem erro de precisão', () => {
      expect(multiplyMoney(10.55, 3)).toBe(31.65);
      expect(multiplyMoney(0.33, 3)).toBe(0.99);
      expect(roundMoney(10.555)).toBe(10.56);
      expect(roundMoney(10.554)).toBe(10.55);
    });

    it('deve calcular corretamente preço de pacote fracionado (ex: 330g a R$ 4,99)', () => {
      const normalized = calculateNormalizedPriceSafe(330, 4.99);

      // 4.99 / 330 = 0.0151212...
      // price_per_100g = 1.51
      // price_per_kg = 15.12
      expect(normalized.price_per_100g).toBe(1.51);
      expect(normalized.price_per_kg).toBe(15.12);
    });

    it('deve calcular porções pequenas (ex: 5g, 15g de azeite a R$ 60/kg) com precisão exata de centavos', () => {
      const priceKg = 60.0; // R$ 60 por kg

      // 5g: 60/1000 * 5 = 0.30
      const cost5g = calculatePortionCostSafe(priceKg, 5);
      expect(cost5g).toBe(0.3);

      // 15g: 60/1000 * 15 = 0.90
      const cost15g = calculatePortionCostSafe(priceKg, 15);
      expect(cost15g).toBe(0.9);
    });

    it('preço desconhecido (NULL) NUNCA vira zero', () => {
      const costNull = calculatePortionCostSafe(null, 100);
      expect(costNull).toBeNull();
      expect(costNull).not.toBe(0);
    });

    it('deve lançar erro em divisões por zero ou valores monetários negativos', () => {
      expect(() => divideMoney(10, 0)).toThrow('Divisão monetária por zero não é permitida.');
      expect(() => calculateNormalizedPriceSafe(0, 10)).toThrow(/positivo/);
      expect(() => calculateNormalizedPriceSafe(100, -5)).toThrow('Preço da embalagem não pode ser negativo.');
    });
  });

  describe('2. Metadados Completos do Price Engine Versionado', () => {
    const mockObs: FoodPriceObservation[] = [
      {
        id: 'obs-1',
        food_id: 'food-arroz',
        country: 'BRA',
        state_region: 'RJ',
        city: 'campos dos goytacazes',
        package_size_g: 1000,
        package_price: 6.5,
        price_per_100g: 0.65,
        price_per_kg: 6.5,
        currency: 'BRL',
        observed_at: '2026-09-01T10:00:00Z',
        source_type: 'professional_input',
        confidence: 0.9,
        created_at: '2026-09-01T10:00:00Z',
      },
      {
        id: 'obs-2',
        food_id: 'food-arroz',
        country: 'BRA',
        state_region: 'RJ',
        city: 'campos dos goytacazes',
        package_size_g: 5000,
        package_price: 30.0,
        price_per_100g: 0.6,
        price_per_kg: 6.0,
        currency: 'BRL',
        observed_at: '2026-08-15T10:00:00Z',
        source_type: 'manual_admin',
        confidence: 1.0,
        created_at: '2026-08-15T10:00:00Z',
      },
    ];

    it('getFoodPriceEstimate deve retornar todos os campos versionados e metadados requeridos', () => {
      const estimate = getFoodPriceEstimate(
        'food-arroz',
        mockObs,
        { country: 'BRA', state_region: 'RJ', city: 'campos dos goytacazes' },
        '2026-09-08T10:00:00Z'
      );

      expect(estimate.estimated_price_per_kg).toBe(6.25);
      expect(estimate.currency).toBe('BRL');
      expect(estimate.source_level).toBe('city');
      expect(estimate.observation_count).toBe(2);
      expect(estimate.freshness).toBe('fresh'); // 7 dias de idade
      expect(estimate.confidence).toBeGreaterThan(0.7);
      expect(estimate.newest_observation_at).toBe('2026-09-01T10:00:00Z');
      expect(estimate.oldest_observation_at).toBe('2026-08-15T10:00:00Z');
      expect(estimate.price_engine_version).toBe(PRICE_ENGINE_VERSION);
      expect(estimate.price_engine_version).toBe('1.0.0');
    });

    it('deve retornar source_level unknown e observation_count 0 para alimentos sem preços', () => {
      const estimate = getFoodPriceEstimate('food-inexistente', mockObs);

      expect(estimate.estimated_price_per_kg).toBeNull();
      expect(estimate.source_level).toBe('unknown');
      expect(estimate.observation_count).toBe(0);
      expect(estimate.freshness).toBe('unknown');
      expect(estimate.oldest_observation_at).toBeNull();
      expect(estimate.newest_observation_at).toBeNull();
    });
  });
});
