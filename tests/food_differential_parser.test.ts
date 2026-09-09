import { describe, it, expect } from 'vitest';
import { parseTacoNutrientValue } from '@/lib/foods/importer/taco-parser';
import { execFileSync } from 'child_process';

describe('Differential Parser Equivalence: TypeScript vs Python', () => {
  const testCases = [
    // 1. Semântica oficial TACO
    { input: 'Tr', expectedStatus: 'TRACE', expectedNum: null },
    { input: 'tr', expectedStatus: 'TRACE', expectedNum: null },
    { input: 'NA', expectedStatus: 'NOT_APPLICABLE', expectedNum: null },
    { input: 'na', expectedStatus: 'NOT_APPLICABLE', expectedNum: null },
    { input: '*', expectedStatus: 'UNDER_REEVALUATION', expectedNum: null },
    { input: '', expectedStatus: 'NOT_REQUESTED', expectedNum: null },
    { input: '   ', expectedStatus: 'NOT_REQUESTED', expectedNum: null },

    // 2. Zero numérico comprovado
    { input: '0', expectedStatus: 'KNOWN_NUMERIC_ZERO', expectedNum: 0.0 },
    { input: '0.0', expectedStatus: 'KNOWN_NUMERIC_ZERO', expectedNum: 0.0 },
    { input: '0,00', expectedStatus: 'KNOWN_NUMERIC_ZERO', expectedNum: 0.0 },

    // 3. Decimais sem remoção de pontuação inicial (,5 e .5 -> 0.5)
    { input: ',5', expectedStatus: 'NUMERIC_VALUE', expectedNum: 0.5 },
    { input: '.5', expectedStatus: 'NUMERIC_VALUE', expectedNum: 0.5 },
    { input: ',25', expectedStatus: 'NUMERIC_VALUE', expectedNum: 0.25 },
    { input: '.75', expectedStatus: 'NUMERIC_VALUE', expectedNum: 0.75 },

    // 4. Correção de pontuação dupla conhecida da TACO (,0,02 -> 0.02)
    { input: ',0,02', expectedStatus: 'NUMERIC_VALUE', expectedNum: 0.02 },

    // 5. Decimais padrão brasileiros com vírgula e ponto
    { input: '12,5', expectedStatus: 'NUMERIC_VALUE', expectedNum: 12.5 },
    { input: '12.5', expectedStatus: 'NUMERIC_VALUE', expectedNum: 12.5 },
    { input: '120.3456', expectedStatus: 'NUMERIC_VALUE', expectedNum: 120.3456 },

    // 6. Números negativos: NÃO PODEM virar zero, devem ser rejeitados como UNKNOWN
    { input: '-1', expectedStatus: 'UNKNOWN', expectedNum: null },
    { input: '-0.5', expectedStatus: 'UNKNOWN', expectedNum: null },
    { input: '-10,2', expectedStatus: 'UNKNOWN', expectedNum: null },

    // 7. Rejeição de strings inválidas / lixo / sufixos (não usar parseFloat permissivo)
    { input: '12abc', expectedStatus: 'UNKNOWN', expectedNum: null },
    { input: '10g', expectedStatus: 'UNKNOWN', expectedNum: null },
    { input: 'abc', expectedStatus: 'UNKNOWN', expectedNum: null },
    { input: '12.34.56', expectedStatus: 'UNKNOWN', expectedNum: null },
    { input: '12,34,56', expectedStatus: 'UNKNOWN', expectedNum: null },
  ];

  it('TypeScript parser satisfies all semantic specifications and edge cases', () => {
    for (const tc of testCases) {
      const tsResult = parseTacoNutrientValue(tc.input);
      expect(
        tsResult.value_status,
        `TS value_status mismatch for input "${tc.input}"`
      ).toBe(tc.expectedStatus);

      if (tc.expectedNum === null) {
        expect(tsResult.numeric_value, `TS numeric_value for "${tc.input}" should be null`).toBeNull();
      } else {
        expect(tsResult.numeric_value, `TS numeric_value for "${tc.input}" mismatch`).toBeCloseTo(tc.expectedNum, 4);
      }
    }
  });

  it('TypeScript and Python produce exact identical semantics across all test cases (Differential Test)', () => {
    // Invoca o parser do script Python em lote com os mesmos inputs
    const pyScript = `
import json, sys
sys.path.insert(0, '.')
from scripts.parse_taco_excel import parse_cell_value

inputs = json.loads(sys.argv[1])
results = []
for inp in inputs:
    res = parse_cell_value(inp)
    results.append({
        'raw_value': res['raw_value'],
        'numeric_value': res['numeric_value'],
        'value_status': res['value_status'],
        'data_quality': res['data_quality']
    })
print(json.dumps(results))
`;

    const rawInputs = testCases.map((tc) => tc.input);
    const pyOutput = execFileSync('python', ['-c', pyScript, JSON.stringify(rawInputs)], {
      encoding: 'utf-8',
    });

    const pyResults = JSON.parse(pyOutput.trim());

    for (let i = 0; i < testCases.length; i++) {
      const tc = testCases[i];
      const tsResult = parseTacoNutrientValue(tc.input);
      const pyResult = pyResults[i];

      // Verificação diferencial rigorosa: TS vs PY
      expect(
        tsResult.value_status,
        `Status mismatch between TS (${tsResult.value_status}) and PY (${pyResult.value_status}) for input "${tc.input}"`
      ).toBe(pyResult.value_status);

      if (pyResult.numeric_value === null) {
        expect(
          tsResult.numeric_value,
          `Numeric value mismatch (expected null): TS=${tsResult.numeric_value}, PY=${pyResult.numeric_value} for "${tc.input}"`
        ).toBeNull();
      } else {
        expect(
          tsResult.numeric_value,
          `Numeric value mismatch: TS=${tsResult.numeric_value}, PY=${pyResult.numeric_value} for "${tc.input}"`
        ).toBeCloseTo(pyResult.numeric_value, 4);
      }

      // data_quality check
      expect(
        tsResult.data_quality,
        `Data quality mismatch between TS (${tsResult.data_quality}) and PY (${pyResult.data_quality}) for input "${tc.input}"`
      ).toBe(pyResult.data_quality);
    }
  });
});
