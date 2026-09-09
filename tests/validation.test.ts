import { describe, it, expect } from 'vitest';
import { loginSchema, registerSchema, patientLinkSchema } from '@/lib/validations/auth';

describe('Validation Schemas (Server-side Input Sanitization)', () => {
  describe('loginSchema', () => {
    it('should validate valid email and password', () => {
      const result = loginSchema.safeParse({
        email: 'doctor@example.com',
        password: 'password123',
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid email formats', () => {
      const result = loginSchema.safeParse({
        email: 'not-an-email',
        password: 'password123',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain('email');
      }
    });

    it('should reject short passwords', () => {
      const result = loginSchema.safeParse({
        email: 'user@test.com',
        password: '123',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('registerSchema', () => {
    it('should accept valid patient registration payload', () => {
      const result = registerSchema.safeParse({
        fullName: 'Maria Oliveira',
        email: 'maria@example.com',
        password: 'Password123',
      });
      expect(result.success).toBe(true);
    });

    it('CRITICAL: should reject payloads with missing or short names', () => {
      const result = registerSchema.safeParse({
        fullName: 'M',
        email: 'maria@example.com',
        password: 'Password123',
      });
      expect(result.success).toBe(false);
    });

    it('should enforce password complexity (letter and number)', () => {
      const resultNoNumber = registerSchema.safeParse({
        fullName: 'Maria Oliveira',
        email: 'maria@example.com',
        password: 'PasswordOnly',
        role: 'patient',
      });
      expect(resultNoNumber.success).toBe(false);

      const resultNoUppercase = registerSchema.safeParse({
        fullName: 'Maria Oliveira',
        email: 'maria@example.com',
        password: 'password123',
      });
      expect(resultNoUppercase.success).toBe(false);
    });
  });

  describe('patientLinkSchema', () => {
    it('should validate complete patient link payload', () => {
      const result = patientLinkSchema.safeParse({
        professionalId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        patientId: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
        organizationId: 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33',
        isPrimary: true,
        status: 'active',
        linkType: 'direct',
        notes: 'Vínculo primário direto estabelecido em consulta.',
      });
      expect(result.success).toBe(true);
    });

    it('should reject non-UUID strings for relational IDs', () => {
      const result = patientLinkSchema.safeParse({
        professionalId: '123-fake-id',
        patientId: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
        status: 'active',
      });
      expect(result.success).toBe(false);
    });

    it('should only allow accepted status enums', () => {
      const result = patientLinkSchema.safeParse({
        professionalId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        patientId: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
        status: 'random_invalid_status',
      });
      expect(result.success).toBe(false);
    });
  });
});
