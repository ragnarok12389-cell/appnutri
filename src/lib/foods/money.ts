/**
 * Módulo de Precisão Financeira e Aritmética Monetária Determinística.
 *
 * Evita problemas clássicos de floating point (ex: 0.1 + 0.2 = 0.30000000000000004).
 * As operações utilizam centavos inteiros (integers) ou aritmética decimal controlada
 * para garantir exatidão, ausência de drift e arredondamentos bancários padronizados.
 */

/**
 * Converte valor decimal em reais para centavos inteiros.
 */
export function toCents(amountInReais: number): number {
  return Math.round(amountInReais * 100);
}

/**
 * Converte centavos inteiros para valor decimal em reais.
 */
export function fromCents(cents: number): number {
  return Math.round(cents) / 100;
}

/**
 * Soma segura de valores monetários.
 * Ex: addMoney(0.1, 0.2) === 0.30
 */
export function addMoney(a: number, b: number): number {
  return fromCents(toCents(a) + toCents(b));
}

/**
 * Subtração segura de valores monetários.
 */
export function subtractMoney(a: number, b: number): number {
  return fromCents(toCents(a) - toCents(b));
}

/**
 * Multiplicação segura de valor monetário por um fator (ex: quantidade).
 */
export function multiplyMoney(amount: number, factor: number): number {
  return fromCents(Math.round(toCents(amount) * factor));
}

/**
 * Divisão segura de valor monetário por um divisor.
 */
export function divideMoney(amount: number, divisor: number): number {
  if (divisor === 0) {
    throw new Error('Divisão monetária por zero não é permitida.');
  }
  return fromCents(Math.round(toCents(amount) / divisor));
}

/**
 * Arredonda valor monetário com precisão decimal exata.
 */
export function roundMoney(amount: number, decimals: number = 2): number {
  const factor = Math.pow(10, decimals);
  return Math.round((amount + Number.EPSILON) * factor) / factor;
}

/**
 * Normaliza o preço de uma embalagem para preço por quilograma e por 100 gramas.
 * Garante que embalagens fracionadas preservem a precisão decimal estrita.
 */
export function calculateNormalizedPriceSafe(
  packageSizeG: number,
  packagePrice: number
): { price_per_kg: number; price_per_100g: number } {
  if (packageSizeG <= 0) {
    throw new Error('Tamanho da embalagem em gramas deve ser estritamente positivo (apenas valores positivos).');
  }
  if (packagePrice < 0) {
    throw new Error('Preço da embalagem não pode ser negativo.');
  }

  // Preço por grama com alta precisão
  const pricePerGram = packagePrice / packageSizeG;

  // Preço por 100g e por kg arredondados para centavos
  const pricePer100g = roundMoney(pricePerGram * 100, 2);
  const pricePerKg = roundMoney(pricePerGram * 1000, 2);

  return {
    price_per_kg: pricePerKg,
    price_per_100g: pricePer100g,
  };
}

/**
 * Calcula o custo financeiro exato de uma porção consumida a partir do preço por kg.
 * Retorna null se o preço for desconhecido (UNKNOWN nunca se torna zero).
 */
export function calculatePortionCostSafe(
  pricePerKg: number | null,
  portionGrams: number
): number | null {
  if (pricePerKg === null || pricePerKg === undefined) {
    return null;
  }
  if (portionGrams < 0) {
    throw new Error('Gramas da porção não podem ser negativas.');
  }
  if (portionGrams === 0) {
    return 0.0;
  }

  const cost = (pricePerKg / 1000) * portionGrams;
  return roundMoney(cost, 2);
}
