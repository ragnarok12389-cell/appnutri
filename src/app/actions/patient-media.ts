'use server';

import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentUser } from '@/lib/auth/session';
import { hasRole } from '@/lib/auth/roles';
import { PatientMealPhoto, PatientProgressPhoto } from '@/types/patient-media';

export async function getPatientMediaAction(): Promise<{
  progressPhotos: PatientProgressPhoto[];
  mealPhotos: PatientMealPhoto[];
  error?: string;
}> {
  const user = await getCurrentUser();
  if (!user || !hasRole(user, 'patient')) return { progressPhotos: [], mealPhotos: [], error: 'Acesso restrito.' };

  const admin = createAdminClient();
  const [progress, meals] = await Promise.all([
    admin.from('patient_progress_photos').select('id, checkpoint, storage_path, captured_at, notes').eq('patient_id', user.id).order('captured_at', { ascending: false }),
    admin.from('meal_photo_analyses').select('id, storage_path, captured_at, status, analysis, error_code').eq('patient_id', user.id).order('captured_at', { ascending: false }).limit(12),
  ]);

  if (progress.error || meals.error) return { progressPhotos: [], mealPhotos: [], error: 'Não foi possível carregar suas fotos.' };
  const rows = [...(progress.data ?? []), ...(meals.data ?? [])];
  const signed = await Promise.all(rows.map((row) => admin.storage.from('patient-media').createSignedUrl(row.storage_path, 3600)));
  const urlByPath = new Map(rows.map((row, index) => [row.storage_path, signed[index].data?.signedUrl ?? '']));

  return {
    progressPhotos: (progress.data ?? []).map((row) => ({
      id: row.id,
      checkpoint: row.checkpoint,
      captured_at: row.captured_at,
      notes: row.notes,
      signed_url: urlByPath.get(row.storage_path) ?? '',
    })) as PatientProgressPhoto[],
    mealPhotos: (meals.data ?? []).map((row) => ({
      id: row.id,
      captured_at: row.captured_at,
      status: row.status,
      analysis: row.analysis,
      error_code: row.error_code,
      signed_url: urlByPath.get(row.storage_path) ?? '',
    })) as PatientMealPhoto[],
  };
}
