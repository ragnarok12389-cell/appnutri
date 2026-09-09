import { describe, it, expect } from 'vitest';
import {
  parseTacoNutrientValue,
  validateEnergyConsistency,
  determineEngineEligibility,
  normalizeFoodText,
} from '../src/lib/foods/importer/taco-parser';
import { parseAndNormalizeTacoDataset } from '../src/lib/foods/importer/import-pipeline';

describe('ETAPA 5: Food Importer & TACO Dataset Pipeline', () => {
  describe('1. Parser de Valores Analíticos Especiais da TACO (Semântica Oficial)', () => {
    it('deve converter "Tr" e "tr" em TRACE com numeric_value NULL e data_quality trace', () => {
      const res1 = parseTacoNutrientValue('Tr');
      expect(res1.numeric_value).toBeNull();
      expect(res1.amount).toBeNull();
      expect(res1.value_status).toBe('TRACE');
      expect(res1.data_quality).toBe('trace');
      expect(res1.raw_value).toBe('Tr');

      const res2 = parseTacoNutrientValue('tr');
      expect(res2.numeric_value).toBeNull();
      expect(res2.value_status).toBe('TRACE');
      expect(res2.data_quality).toBe('trace');
    });

    it('deve converter "NA" e "na" em NOT_APPLICABLE com numeric_value NULL e data_quality not_applicable', () => {
      const res1 = parseTacoNutrientValue('NA');
      expect(res1.numeric_value).toBeNull();
      expect(res1.amount).toBeNull();
      expect(res1.value_status).toBe('NOT_APPLICABLE');
      expect(res1.data_quality).toBe('not_applicable');
      expect(res1.raw_value).toBe('NA');

      const res2 = parseTacoNutrientValue('na');
      expect(res2.numeric_value).toBeNull();
      expect(res2.value_status).toBe('NOT_APPLICABLE');
      expect(res2.data_quality).toBe('not_applicable');
    });

    it('deve converter "*" em UNDER_REEVALUATION com numeric_value NULL e data_quality under_reevaluation', () => {
      const resStar = parseTacoNutrientValue('*');
      expect(resStar.numeric_value).toBeNull();
      expect(resStar.amount).toBeNull();
      expect(resStar.value_status).toBe('UNDER_REEVALUATION');
      expect(resStar.data_quality).toBe('under_reevaluation');
      expect(resStar.raw_value).toBe('*');
    });

    it('deve converter string vazia e null em NOT_REQUESTED com numeric_value NULL e data_quality not_requested', () => {
      const resEmpty = parseTacoNutrientValue('');
      expect(resEmpty.numeric_value).toBeNull();
      expect(resEmpty.amount).toBeNull();
      expect(resEmpty.value_status).toBe('NOT_REQUESTED');
      expect(resEmpty.data_quality).toBe('not_requested');

      const resNull = parseTacoNutrientValue(null);
      expect(resNull.numeric_value).toBeNull();
      expect(resNull.value_status).toBe('NOT_REQUESTED');
    });

    it('deve distinguir rigorosamente: TRACE != KNOWN_ZERO', () => {
      const traceVal = parseTacoNutrientValue('Tr');
      const zeroVal = parseTacoNutrientValue(0);

      expect(traceVal.value_status).toBe('TRACE');
      expect(zeroVal.value_status).toBe('KNOWN_NUMERIC_ZERO');
      expect(traceVal.numeric_value).toBeNull();
      expect(zeroVal.numeric_value).toBe(0.0);
      expect(traceVal.value_status).not.toBe(zeroVal.value_status);
      expect(traceVal.numeric_value).not.toBe(zeroVal.numeric_value);
    });

    it('deve distinguir rigorosamente: NA != NOT_ANALYZED (NA é NOT_APPLICABLE)', () => {
      const naVal = parseTacoNutrientValue('NA');
      expect(naVal.value_status).toBe('NOT_APPLICABLE');
      expect(naVal.data_quality).toBe('not_applicable');
      expect(naVal.value_status).not.toBe('NOT_ANALYZED');
    });

    it('deve distinguir rigorosamente: UNDER_REEVALUATION != NOT_AVAILABLE (* é UNDER_REEVALUATION)', () => {
      const starVal = parseTacoNutrientValue('*');
      expect(starVal.value_status).toBe('UNDER_REEVALUATION');
      expect(starVal.data_quality).toBe('under_reevaluation');
      expect(starVal.value_status).not.toBe('NOT_AVAILABLE');
    });

    it('deve distinguir rigorosamente: BLANK != ZERO (vazio é NOT_REQUESTED, nunca zero)', () => {
      const blankVal = parseTacoNutrientValue('');
      const zeroVal = parseTacoNutrientValue('0');

      expect(blankVal.value_status).toBe('NOT_REQUESTED');
      expect(zeroVal.value_status).toBe('KNOWN_NUMERIC_ZERO');
      expect(blankVal.numeric_value).toBeNull();
      expect(zeroVal.numeric_value).toBe(0.0);
      expect(blankVal.value_status).not.toBe(zeroVal.value_status);
    });

    it('TRACE não deve chamar approximateTraceForCalculation automaticamente na Etapa 5 e deve permanecer null', () => {
      const traceParsed = parseTacoNutrientValue('Tr');
      expect(traceParsed.value_status).toBe('TRACE');
      expect(traceParsed.numeric_value).toBeNull();
      expect(traceParsed.amount).toBeNull();

      // Confirma que o pipeline de normalização preserva TRACE sem aproximação silenciosa
      const normalized = parseAndNormalizeTacoDataset('fixture');
      const arrozCru = normalized.foods.find((f) => f.source_food_code === '001');
      expect(arrozCru).toBeDefined();
      expect(arrozCru?.nutrients.iron_mg.value_status).toBe('TRACE');
      expect(arrozCru?.nutrients.iron_mg.numeric_value).toBeNull();
      expect(arrozCru?.nutrients.iron_mg.amount).toBeNull();
    });

    it('deve converter números decimais com vírgula ou ponto preservando o valor analítico', () => {
      const resComma = parseTacoNutrientValue('12,5');
      expect(resComma.numeric_value).toBe(12.5);
      expect(resComma.value_status).toBe('NUMERIC_VALUE');
      expect(resComma.data_quality).toBe('analytical');

      const resDot = parseTacoNutrientValue('12.5');
      expect(resDot.numeric_value).toBe(12.5);
      expect(resDot.value_status).toBe('NUMERIC_VALUE');

      const resNum = parseTacoNutrientValue(358);
      expect(resNum.numeric_value).toBe(358);
      expect(resNum.value_status).toBe('NUMERIC_VALUE');

      const resZero = parseTacoNutrientValue(0);
      expect(resZero.numeric_value).toBe(0);
      expect(resZero.value_status).toBe('KNOWN_NUMERIC_ZERO');
    });

    it('deve tratar entradas corrompidas sem lançar exceções não tratadas', () => {
      const resCorrupted = parseTacoNutrientValue('corrupted_string_value');
      expect(resCorrupted.numeric_value).toBeNull();
      expect(resCorrupted.value_status).toBe('UNKNOWN');
      expect(resCorrupted.data_quality).toBe('unknown');

      const resNaN = parseTacoNutrientValue(NaN);
      expect(resNaN.numeric_value).toBeNull();
      expect(resNaN.value_status).toBe('NOT_REQUESTED');
    });
  });

  describe('2. Normalização Textual e Preservação de Acentos UTF-8', () => {
    it('deve normalizar texto removendo acentos para indexação de busca', () => {
      expect(normalizeFoodText('Maçã Fuji')).toBe('maca fuji');
      expect(normalizeFoodText('Feijão Carioca Cozido')).toBe('feijao carioca cozido');
      expect(normalizeFoodText('Brócolis')).toBe('brocolis');
      expect(normalizeFoodText('Pão Francês')).toBe('pao frances');
    });

    it('deve colapsar múltiplos espaços em branco', () => {
      expect(normalizeFoodText('  Arroz   branco    polido  ')).toBe('arroz branco polido');
    });
  });

  describe('3. Diferenciação Fisiológica Rigorosa: Cru vs Cozido', () => {
    it('arroz cru e arroz cozido devem ser alimentos distintos com densidades calóricas incomparáveis', () => {
      const data = parseAndNormalizeTacoDataset('fixture');

      const arrozCru = data.foods.find((f) => f.source_food_code === '001');
      const arrozCozido = data.foods.find((f) => f.source_food_code === '003');

      expect(arrozCru).toBeDefined();
      expect(arrozCozido).toBeDefined();

      expect(arrozCru?.preparation_state).toBe('raw');
      expect(arrozCozido?.preparation_state).toBe('cooked');

      expect(arrozCru?.nutrients.energy_kcal?.numeric_value).toBe(358);
      expect(arrozCozido?.nutrients.energy_kcal?.numeric_value).toBe(128);
    });

    it('frango cru e frango grelhado devem ter teores proteicos distintos por perda de água', () => {
      const data = parseAndNormalizeTacoDataset('fixture');

      const frangoCru = data.foods.find((f) => f.source_food_code === '070');
      const frangoGrelhado = data.foods.find((f) => f.source_food_code === '071');

      expect(frangoCru?.preparation_state).toBe('raw');
      expect(frangoGrelhado?.preparation_state).toBe('grilled');

      expect(frangoCru?.nutrients.protein_g?.numeric_value).toBe(21.5);
      expect(frangoGrelhado?.nutrients.protein_g?.numeric_value).toBe(32.0);
    });
  });

  describe('4. Idempotência e Consistência do Pipeline de Importação', () => {
    it('deve produzir checksum estável e dataset idêntico em múltiplas execuções', () => {
      const run1 = parseAndNormalizeTacoDataset('fixture');
      const run2 = parseAndNormalizeTacoDataset('fixture');

      expect(run1.checksum).toHaveLength(64);
      expect(run1.checksum).toBe(run2.checksum);
      expect(run1.foods.length).toBe(run2.foods.length);
      expect(run1.foods.length).toBeGreaterThanOrEqual(20);
    });

    it('cada alimento deve possuir código único da fonte sem duplicatas', () => {
      const data = parseAndNormalizeTacoDataset('fixture');
      const codes = data.foods.map((f) => f.source_food_code);
      const uniqueCodes = new Set(codes);

      expect(codes.length).toBe(uniqueCodes.size);
    });

    it('todos os alimentos elegíveis devem possuir macronutrientes obrigatórios não nulos', () => {
      const data = parseAndNormalizeTacoDataset('fixture');

      for (const food of data.foods) {
        if (food.engine_eligibility_status === 'eligible_for_engine') {
          expect(food.nutrients.energy_kcal?.numeric_value).not.toBeNull();
          expect(food.nutrients.protein_g?.numeric_value).not.toBeNull();
          expect(food.nutrients.carbohydrate_g?.numeric_value).not.toBeNull();
          expect(food.nutrients.fat_g?.numeric_value).not.toBeNull();
        }
      }
    });

    it('deve validar consistência Atwater da energia declarada vs macros', () => {
      const res1 = validateEnergyConsistency(128, 2.5, 28.1, 0.2);
      expect(['consistent', 'within_tolerance']).toContain(res1.status);

      const res2 = validateEnergyConsistency(null, 10, 10, 10);
      expect(res2.status).toBe('insufficient_data');

      const res3 = validateEnergyConsistency(500, 1, 1, 1);
      expect(res3.status).toBe('different_from_macro_estimate');
    });

    it('deve determinar elegibilidade para o motor de acordo com a completude de macros', () => {
      const eligible = determineEngineEligibility({
        energy_kcal: 100,
        protein_g: 10,
        carbohydrate_g: 10,
        fat_g: 2,
      });
      expect(eligible).toBe('eligible_for_engine');

      const incomplete = determineEngineEligibility({
        energy_kcal: 100,
        protein_g: null,
      });
      expect(incomplete).toBe('incomplete_nutrition');
    });
  });
});
