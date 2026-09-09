import crypto from 'crypto';

/**
 * Utilitários criptográficos para tokens de convite de profissionais e pacientes.
 * 
 * Regras de Segurança:
 * 1. Tokens crus possuem 256 bits de entropia gerados via CSPRNG (crypto.randomBytes).
 * 2. O token cru NUNCA é armazenado no banco de dados.
 * 3. Apenas o hash SHA-256 do token é persistido na base de dados.
 * 4. Nenhuma informação sensível ou decodificável é embutida no token.
 */

export interface GeneratedToken {
  rawToken: string;
  tokenHash: string;
}

/**
 * Gera um novo token seguro e seu respectivo hash SHA-256.
 */
export function generateInviteToken(): GeneratedToken {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashInviteToken(rawToken);
  return { rawToken, tokenHash };
}

/**
 * Calcula o hash SHA-256 de um token cru fornecido.
 */
export function hashInviteToken(rawToken: string): string {
  if (!rawToken || typeof rawToken !== 'string' || rawToken.trim().length === 0) {
    throw new Error('Token inválido para hashing.');
  }
  return crypto.createHash('sha256').update(rawToken.trim()).digest('hex');
}

/**
 * Calcula a data de expiração padrão para convites (em dias).
 * Padrão: 7 dias a partir de agora.
 */
export function calculateExpirationDate(daysValid = 7): Date {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + daysValid);
  return expiresAt;
}
