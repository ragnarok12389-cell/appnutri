import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { MealPhotoAnalysisSchema } from '@/types/patient-media';
import { extensionForMimeType, hasValidImageSignature, PATIENT_IMAGE_MAX_BYTES, validatePatientImage } from '@/lib/patient-media/validation';

describe('ETAPA 11A: fotos privadas e visão de refeições', () => {
  it('aceita apenas imagens suportadas e limita o arquivo a 8 MB', () => {
    expect(validatePatientImage(new File(['photo'], 'photo.jpg', { type: 'image/jpeg' }))).toBeNull();
    expect(validatePatientImage(new File(['x'], 'photo.svg', { type: 'image/svg+xml' }))).toMatch(/JPG/);
    const oversized = new File([new Uint8Array(PATIENT_IMAGE_MAX_BYTES + 1)], 'large.webp', { type: 'image/webp' });
    expect(validatePatientImage(oversized)).toMatch(/8 MB/);
    expect(extensionForMimeType('image/png')).toBe('png');
    expect(hasValidImageSignature(Uint8Array.from([0xff, 0xd8, 0xff, 0x00]), 'image/jpeg')).toBe(true);
    expect(hasValidImageSignature(Uint8Array.from([0x3c, 0x73, 0x76, 0x67]), 'image/jpeg')).toBe(false);
  });

  it('recusa uma análise visual sem linguagem de incerteza estruturada', () => {
    const valid = MealPhotoAnalysisSchema.safeParse({
      summary: 'Arroz, feijão e uma fonte de proteína são visíveis.',
      identified_items: [{ name: 'arroz', confidence: 0.8 }],
      estimated_calories: { min: 450, max: 700 },
      estimated_macros_g: { protein: 30, carbohydrate: 65, fat: 18 },
      plan_alignment: 'unclear', observations: ['A porção não pode ser medida pela foto.'],
      safety_flags: [], confidence: 'medium', disclaimer: 'Estimativa visual educativa; confirme ingredientes e porções.',
    });
    expect(valid.success).toBe(true);
    expect(MealPhotoAnalysisSchema.safeParse({ ...valid.data, confidence: 'certain' }).success).toBe(false);
  });

  it('mantém bucket privado e políticas vinculadas ao primeiro segmento do paciente', () => {
    const sql = fs.readFileSync(path.resolve(__dirname, '../supabase/migrations/20260909000021_patient_media_and_meal_vision.sql'), 'utf8');
    expect(sql).toContain("VALUES ('patient-media', 'patient-media', FALSE");
    expect(sql).toContain("(storage.foldername(name))[1] = auth.uid()::text");
    expect(sql).toContain('ALTER TABLE public.patient_progress_photos ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain('ALTER TABLE public.meal_photo_analyses ENABLE ROW LEVEL SECURITY');
    expect(sql).not.toContain('CREATE POLICY "Professionals');
  });
});
