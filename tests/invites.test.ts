import { describe, it, expect } from 'vitest';
import { generateInviteToken, hashInviteToken, calculateExpirationDate } from '@/lib/crypto/tokens';
import {
  createProfessionalInviteSchema,
  createPatientInviteSchema,
  acceptPatientInviteSchema,
} from '@/lib/validations/invites';
import {
  patientOnboardingSchema,
  nutritionistOnboardingSchema,
  influencerOnboardingSchema,
} from '@/lib/validations/onboarding';

describe('Cryptographic Tokens & Validation Unit Tests (Etapa 2)', () => {
  describe('Cryptographic Token Generation & Hashing', () => {
    it('should generate 32-byte (64 hex character) tokens with SHA-256 hash', () => {
      const { rawToken, tokenHash } = generateInviteToken();

      expect(rawToken).toBeDefined();
      expect(rawToken.length).toBe(64); // 32 bytes in hex = 64 characters
      expect(tokenHash).toBeDefined();
      expect(tokenHash.length).toBe(64); // SHA-256 hex digest = 64 characters

      // Verify that hashing rawToken manually yields identical tokenHash
      const manualHash = hashInviteToken(rawToken);
      expect(manualHash).toBe(tokenHash);
    });

    it('should never produce duplicate tokens across iterations', () => {
      const tokens = new Set<string>();
      const hashes = new Set<string>();

      for (let i = 0; i < 50; i++) {
        const { rawToken, tokenHash } = generateInviteToken();
        expect(tokens.has(rawToken)).toBe(false);
        expect(hashes.has(tokenHash)).toBe(false);
        tokens.add(rawToken);
        hashes.add(tokenHash);
      }
    });

    it('should reject empty or invalid tokens when hashing', () => {
      expect(() => hashInviteToken('')).toThrow();
      expect(() => hashInviteToken('   ')).toThrow();
    });

    it('should calculate valid expiration dates into the future', () => {
      const expDate = calculateExpirationDate(7);
      const now = new Date();
      expect(expDate.getTime()).toBeGreaterThan(now.getTime());
      
      const diffDays = Math.round((expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      expect(diffDays).toBe(7);
    });
  });

  describe('Invite Validation Schemas', () => {
    it('should validate professional invite for nutritionist or influencer', () => {
      const validNutri = createProfessionalInviteSchema.safeParse({
        email: 'nutri@clinic.com',
        role_id: 'nutritionist',
        expires_in_days: 14,
      });
      expect(validNutri.success).toBe(true);

      const validInfluencer = createProfessionalInviteSchema.safeParse({
        email: 'creator@fitness.com',
        role_id: 'influencer',
      });
      expect(validInfluencer.success).toBe(true);
    });

    it('CRITICAL: should reject role "admin" or "patient" in professional invite schema', () => {
      const adminAttempt = createProfessionalInviteSchema.safeParse({
        email: 'attacker@evil.com',
        role_id: 'admin',
      });
      expect(adminAttempt.success).toBe(false);

      const patientAttempt = createProfessionalInviteSchema.safeParse({
        email: 'patient@evil.com',
        role_id: 'patient',
      });
      expect(patientAttempt.success).toBe(false);
    });

    it('should validate patient invite generation with or without email', () => {
      const withEmail = createPatientInviteSchema.safeParse({
        email: 'patient@example.com',
        expires_in_days: 7,
      });
      expect(withEmail.success).toBe(true);

      const withoutEmail = createPatientInviteSchema.safeParse({
        email: '',
      });
      expect(withoutEmail.success).toBe(true);

      const invalidEmail = createPatientInviteSchema.safeParse({
        email: 'not-an-email',
      });
      expect(invalidEmail.success).toBe(false);
    });

    it('should validate patient invite acceptance schema', () => {
      const validAccept = acceptPatientInviteSchema.safeParse({
        token: 'a'.repeat(64),
        full_name: 'Carlos Drummond',
        email: 'carlos@example.com',
        password: 'Password123!',
      });
      expect(validAccept.success).toBe(true);

      const shortToken = acceptPatientInviteSchema.safeParse({
        token: 'short-tok',
        full_name: 'Carlos Drummond',
        email: 'carlos@example.com',
        password: 'Password123!',
      });
      expect(shortToken.success).toBe(false);
    });
  });

  describe('Onboarding Validation Schemas', () => {
    it('should validate patient onboarding with valid goals and measurements', () => {
      const valid = patientOnboardingSchema.safeParse({
        first_name: 'Mariana',
        last_name: 'Santos',
        birth_date: '1995-06-15',
        gender: 'female',
        height_cm: 168.5,
        weight_kg: 62.3,
        primary_goal: 'lose_weight',
      });
      expect(valid.success).toBe(true);
    });

    it('should reject invalid primary goals or out-of-range metrics', () => {
      const invalidGoal = patientOnboardingSchema.safeParse({
        first_name: 'Mariana',
        last_name: 'Santos',
        primary_goal: 'become_superhuman', // Invalid
      });
      expect(invalidGoal.success).toBe(false);

      const invalidHeight = patientOnboardingSchema.safeParse({
        first_name: 'Mariana',
        last_name: 'Santos',
        height_cm: 400, // Too high
        primary_goal: 'maintain_weight',
      });
      expect(invalidHeight.success).toBe(false);
    });

    it('should require CRN and license state for nutritionists', () => {
      const validNutri = nutritionistOnboardingSchema.safeParse({
        license_number: 'CRN-3 12345',
        license_state: 'SP',
        bio: 'Especialista em nutrição esportiva',
        specialties: ['Esportiva', 'Hipertrofia'],
      });
      expect(validNutri.success).toBe(true);

      const missingState = nutritionistOnboardingSchema.safeParse({
        license_number: 'CRN-3 12345',
        license_state: 'SAOPAULO', // Must be 2 chars
        specialties: ['Esportiva'],
      });
      expect(missingState.success).toBe(false);
    });

    it('should require niche for influencer profile onboarding', () => {
      const validInfluencer = influencerOnboardingSchema.safeParse({
        niche: 'Fitness & Lifestyle',
        bio: 'Conteúdo diário de rotina e saúde',
        social_links: { instagram: '@fitcreator' },
      });
      expect(validInfluencer.success).toBe(true);

      const emptyNiche = influencerOnboardingSchema.safeParse({
        niche: '',
      });
      expect(emptyNiche.success).toBe(false);
    });
  });
});
