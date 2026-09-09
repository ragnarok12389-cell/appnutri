import { describe, it, expect } from 'vitest';
import {
  calculateNormalizedPrice,
  calculatePortionCost,
  classifyPriceFreshness,
  getFoodPriceEstimate,
  calculateEconomicNutritionalMetrics,
} from '../src/lib/foods/pricing';
import { FoodPriceObservation } from '../src/types/food';

describe('ETAPA 5: Food Pricing & Financial Metrics Tests', () => {
  describe('1. Normalização de Pacotes para Preço por KG e por 100g', () => {
    it('deve normalizar pacote de 1kg (1000g) a R$ 6,00 corretamente', () => {
      const res = calculateNormalizedPrice(1000, 6.0);
      expect(res.price_per_kg).toBe(6.0);
      expect(res.price_per_100g).toBe(0.6);
    });

    it('deve normalizar pacote de 500g a R$ 4,50 corretamente', () => {
      const res = calculateNormalizedPrice(500, 4.5);
      expect(res.price_per_kg).toBe(9.0);
      expect(res.price_per_100g).toBe(0.9);
    });

    it('deve normalizar pacote fracionado com precisão decimal (ex: 350g a R$ 5,25)', () => {
      const res = calculateNormalizedPrice(350, 5.25);
      expect(res.price_per_kg).toBe(15.0);
      expect(res.price_per_100g).toBe(1.5);
    });

    it('deve lançar erro se gramatura for zero ou negativa', () => {
      expect(() => calculateNormalizedPrice(0, 10)).toThrow(/positivos/i);
      expect(() => calculateNormalizedPrice(-500, 10)).toThrow(/positivos/i);
    });
  });

  describe('2. Cálculo do Custo Exato de Porção', () => {
    it('deve calcular custo de porção de 150g com preço de R$ 8,00/kg', () => {
      // (8.00 / 1000) * 150 = R$ 1,20
      const cost = calculatePortionCost(8.0, 150);
      expect(cost).toBe(1.2);
    });

    it('deve calcular custo de porção de 75g com preço de R$ 22,50/kg com arredondamento centesimal', () => {
      // (22.50 / 1000) * 75 = 1.6875 -> R$ 1,69
      const cost = calculatePortionCost(22.5, 75);
      expect(cost).toBe(1.69);
    });

    it('porção de 0g deve custar R$ 0,00', () => {
      const cost = calculatePortionCost(15.0, 0);
      expect(cost).toBe(0.0);
    });
  });

  describe('3. Classificação Temporal de Frescor de Preço (Freshness)', () => {
    const today = '2026-09-08T12:00:00Z';

    it('observação com 10 dias deve ser classificada como "fresh"', () => {
      const obsDate = '2026-08-29T12:00:00Z'; // 10 dias atrás
      const res = classifyPriceFreshness(obsDate, today);
      expect(res.freshness).toBe('fresh');
      expect(res.age_days).toBe(10);
    });

    it('observação com 45 dias deve ser classificada como "aging"', () => {
      const obsDate = '2026-07-25T12:00:00Z'; // 45 dias atrás
      const res = classifyPriceFreshness(obsDate, today);
      expect(res.freshness).toBe('aging');
      expect(res.age_days).toBe(45);
    });

    it('observação com mais de 90 dias deve ser classificada como "stale"', () => {
      const obsDate = '2026-05-01T12:00:00Z'; // > 120 dias atrás
      const res = classifyPriceFreshness(obsDate, today);
      expect(res.freshness).toBe('stale');
      expect(res.age_days).toBeGreaterThan(90);
    });
  });

  describe('4. Índice de Preço Determinístico & Hierarquia de Localização', () => {
    const sampleObservations: FoodPriceObservation[] = [
      {
        id: 'obs-city-1',
        food_id: 'food-arroz',
        country: 'BRA',
        state_region: 'RJ',
        city: 'Campos dos Goytacazes',
        package_size_g: 1000,
        package_price: 5.5,
        currency: 'BRL',
        price_per_100g: 0.55,
        price_per_kg: 5.5,
        observed_at: '2026-09-01T10:00:00Z',
        source_type: 'manual_admin',
        confidence: 1.0,
        created_at: '2026-09-01T10:00:00Z',
      },
      {
        id: 'obs-state-1',
        food_id: 'food-arroz',
        country: 'BRA',
        state_region: 'RJ',
        city: 'Niterói',
        package_size_g: 1000,
        package_price: 6.2,
        currency: 'BRL',
        price_per_100g: 0.62,
        price_per_kg: 6.2,
        observed_at: '2026-09-02T10:00:00Z',
        source_type: 'manual_admin',
        confidence: 1.0,
        created_at: '2026-09-02T10:00:00Z',
      },
      {
        id: 'obs-sp-1',
        food_id: 'food-arroz',
        country: 'BRA',
        state_region: 'SP',
        city: 'Campinas',
        package_size_g: 1000,
        package_price: 7.0,
        currency: 'BRL',
        price_per_100g: 0.7,
        price_per_kg: 7.0,
        observed_at: '2026-09-03T10:00:00Z',
        source_type: 'manual_admin',
        confidence: 1.0,
        created_at: '2026-09-03T10:00:00Z',
      },
    ];

    it('deve priorizar observação da mesma cidade quando disponível', () => {
      const estimate = getFoodPriceEstimate(
        'food-arroz',
        sampleObservations,
        { country: 'BRA', state_region: 'RJ', city: 'Campos dos Goytacazes' },
        '2026-09-08T12:00:00Z'
      );

      expect(estimate.price_source_level).toBe('city');
      expect(estimate.estimated_price_per_kg).toBe(5.5);
      expect(estimate.estimated_price_per_100g).toBe(0.55);
      expect(estimate.freshness).toBe('fresh');
      expect(estimate.sample_count).toBe(1);
    });

    it('deve fazer fallback para o estado quando a cidade não possuir observação direta', () => {
      const estimate = getFoodPriceEstimate(
        'food-arroz',
        sampleObservations,
        { country: 'BRA', state_region: 'RJ', city: 'Petrópolis' }, // Cidade sem observação, mas no RJ
        '2026-09-08T12:00:00Z'
      );

      expect(estimate.price_source_level).toBe('state');
      // Média do RJ: (5.5 + 6.2) / 2 = 5.85
      expect(estimate.estimated_price_per_kg).toBe(5.85);
      expect(estimate.sample_count).toBe(2);
    });

    it('deve fazer fallback para a média nacional quando o estado não possuir dados', () => {
      const estimate = getFoodPriceEstimate(
        'food-arroz',
        sampleObservations,
        { country: 'BRA', state_region: 'MG', city: 'Belo Horizonte' }, // MG sem observação
        '2026-09-08T12:00:00Z'
      );

      expect(estimate.price_source_level).toBe('national');
      // Média nacional de todas as 3 observações: (5.5 + 6.2 + 7.0) / 3 = 6.23
      expect(estimate.estimated_price_per_kg).toBe(6.23);
      expect(estimate.sample_count).toBe(3);
    });

    it('deve retornar unknown quando o alimento não possuir nenhuma observação (não inventa zero)', () => {
      const estimate = getFoodPriceEstimate(
        'food-sem-preco',
        sampleObservations,
        { country: 'BRA', state_region: 'RJ', city: 'Rio de Janeiro' }
      );

      expect(estimate.estimated_price_per_kg).toBeNull();
      expect(estimate.price_source_level).toBe('unknown');
      expect(estimate.freshness).toBe('unknown');
      expect(estimate.sample_count).toBe(0);
    });
  });

  describe('5. Métricas de Eficiência Econômico-Nutricional', () => {
    it('deve calcular custo por 100g, por 100 kcal e por 10g de proteína', () => {
      // Frango grelhado a R$ 25,00/kg:
      // 100g tem 159 kcal e 32g de proteína
      // Custo por 100g = R$ 2,50
      // Custo por 100 kcal = (2.50 / 159) * 100 = R$ 1,57
      // Custo por 10g proteína = (2.50 / 32) * 10 = R$ 0,78
      const metrics = calculateEconomicNutritionalMetrics(
        'food-frango',
        25.0,
        159,
        32.0
      );

      expect(metrics.cost_per_100g).toBe(2.5);
      expect(metrics.cost_per_100_kcal).toBe(1.57);
      expect(metrics.cost_per_10g_protein).toBe(0.78);
    });

    it('deve retornar nulo se o preço for desconhecido', () => {
      const metrics = calculateEconomicNutritionalMetrics('food-sem-preco', null, 150, 20);
      expect(metrics.cost_per_100g).toBeNull();
      expect(metrics.cost_per_100_kcal).toBeNull();
      expect(metrics.cost_per_10g_protein).toBeNull();
    });
  });

  describe('6. Isolamento Estrito de Moeda (BRL vs USD) e País (BRA vs USA)', () => {
    const mixedCurrencyObservations: FoodPriceObservation[] = [
      {
        id: 'obs-brl-1',
        food_id: 'food-whey',
        country: 'BRA',
        state_region: 'SP',
        city: 'São Paulo',
        package_size_g: 1000,
        package_price: 100.0,
        currency: 'BRL',
        price_per_100g: 10.0,
        price_per_kg: 100.0,
        observed_at: '2026-09-01T10:00:00Z',
        source_type: 'manual_admin',
        confidence: 1.0,
        created_at: '2026-09-01T10:00:00Z',
      },
      {
        id: 'obs-usd-1',
        food_id: 'food-whey',
        country: 'USA',
        state_region: 'CA',
        city: 'Los Angeles',
        package_size_g: 1000,
        package_price: 30.0, // 30 USD
        currency: 'USD',
        price_per_100g: 3.0,
        price_per_kg: 30.0,
        observed_at: '2026-09-01T10:00:00Z',
        source_type: 'manual_admin',
        confidence: 1.0,
        created_at: '2026-09-01T10:00:00Z',
      },
    ];

    it('NUNCA deve agregar observações em moedas diferentes (BRL vs USD)', () => {
      // Consulta para BRL no Brasil: deve considerar EXCLUSIVAMENTE a observação em BRL
      const estimateBRL = getFoodPriceEstimate(
        'food-whey',
        mixedCurrencyObservations,
        { country: 'BRA' },
        '2026-09-08T12:00:00Z',
        'BRL'
      );
      expect(estimateBRL.currency).toBe('BRL');
      expect(estimateBRL.estimated_price_per_kg).toBe(100.0);
      expect(estimateBRL.sample_count).toBe(1);

      // Consulta para USD nos EUA: deve considerar EXCLUSIVAMENTE a observação em USD
      const estimateUSD = getFoodPriceEstimate(
        'food-whey',
        mixedCurrencyObservations,
        { country: 'USA' },
        '2026-09-08T12:00:00Z',
        'USD'
      );
      expect(estimateUSD.currency).toBe('USD');
      expect(estimateUSD.estimated_price_per_kg).toBe(30.0);
      expect(estimateUSD.sample_count).toBe(1);
    });

    it('Se o target country não possuir observações, NÃO deve fazer fallback para outro país', () => {
      // Alimento que só possui preço nos EUA (USA), consultado para o Brasil (BRA)
      const usOnlyObservations: FoodPriceObservation[] = [
        {
          id: 'obs-us-only',
          food_id: 'food-almond-milk',
          country: 'USA',
          state_region: 'NY',
          city: 'New York',
          package_size_g: 1000,
          package_price: 4.0,
          currency: 'USD',
          price_per_100g: 0.4,
          price_per_kg: 4.0,
          observed_at: '2026-09-01T10:00:00Z',
          source_type: 'manual_admin',
          confidence: 1.0,
          created_at: '2026-09-01T10:00:00Z',
        },
      ];

      const estimate = getFoodPriceEstimate(
        'food-almond-milk',
        usOnlyObservations,
        { country: 'BRA' },
        '2026-09-08T12:00:00Z',
        'BRL'
      );

      // Deve retornar unknown e null, sem vazar preços de outros países
      expect(estimate.estimated_price_per_kg).toBeNull();
      expect(estimate.price_source_level).toBe('unknown');
      expect(estimate.sample_count).toBe(0);
    });
  });

  describe('7. Fallback Temporal e Descarte de Datas Futuras', () => {
    const today = '2026-09-08T12:00:00Z';

    it('Observação stale de cidade NÃO deve vencer observação fresh de estado quando há dado recente', () => {
      const observations: FoodPriceObservation[] = [
        {
          id: 'obs-city-stale',
          food_id: 'food-feijao',
          country: 'BRA',
          state_region: 'SP',
          city: 'Campinas',
          package_size_g: 1000,
          package_price: 4.0, // Preço muito antigo de 180 dias atrás
          currency: 'BRL',
          price_per_100g: 0.4,
          price_per_kg: 4.0,
          observed_at: '2026-03-01T10:00:00Z', // 190 dias atrás (stale)
          source_type: 'manual_admin',
          confidence: 1.0,
          created_at: '2026-03-01T10:00:00Z',
        },
        {
          id: 'obs-state-recent',
          food_id: 'food-feijao',
          country: 'BRA',
          state_region: 'SP',
          city: 'São Paulo',
          package_size_g: 1000,
          package_price: 8.5, // Preço recente do estado
          currency: 'BRL',
          price_per_100g: 0.85,
          price_per_kg: 8.5,
          observed_at: '2026-09-05T10:00:00Z', // 3 dias atrás (fresh)
          source_type: 'manual_admin',
          confidence: 1.0,
          created_at: '2026-09-05T10:00:00Z',
        },
      ];

      // Busca para Campinas, SP
      const estimate = getFoodPriceEstimate(
        'food-feijao',
        observations,
        { country: 'BRA', state_region: 'SP', city: 'Campinas' },
        today,
        'BRL'
      );

      // O dado recente do estado deve VENCER o dado stale da cidade
      expect(estimate.price_source_level).toBe('state');
      expect(estimate.estimated_price_per_kg).toBe(8.5);
      expect(estimate.freshness).toBe('fresh');
    });

    it('Observação com observed_at no futuro deve ser terminantemente rejeitada', () => {
      const futureObservations: FoodPriceObservation[] = [
        {
          id: 'obs-future',
          food_id: 'food-carne',
          country: 'BRA',
          state_region: 'SP',
          city: 'São Paulo',
          package_size_g: 1000,
          package_price: 50.0,
          currency: 'BRL',
          price_per_100g: 5.0,
          price_per_kg: 50.0,
          observed_at: '2026-12-31T23:59:59Z', // Data no futuro!
          source_type: 'manual_admin',
          confidence: 1.0,
          created_at: '2026-09-08T12:00:00Z',
        },
      ];

      const estimate = getFoodPriceEstimate(
        'food-carne',
        futureObservations,
        { country: 'BRA', state_region: 'SP', city: 'São Paulo' },
        today,
        'BRL'
      );

      expect(estimate.estimated_price_per_kg).toBeNull();
      expect(estimate.sample_count).toBe(0);
      expect(estimate.price_source_level).toBe('unknown');
    });
  });
});
