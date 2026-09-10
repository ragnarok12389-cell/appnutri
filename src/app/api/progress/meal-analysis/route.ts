import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logAuditEvent } from '@/lib/audit/logger';
import { analyzeMealImage } from '@/lib/patient-media/meal-analysis';
import { extensionForMimeType, hasValidImageSignature, validatePatientImage } from '@/lib/patient-media/validation';

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  const form = await request.formData();
  const file = form.get('photo');
  if (!(file instanceof File)) return NextResponse.json({ error: 'Selecione uma foto do prato.' }, { status: 400 });
  const validationError = validatePatientImage(file);
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });

  const admin = createAdminClient();
  const rateWindowStart = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count: recentAnalysisCount, error: rateError } = await admin
    .from('meal_photo_analyses')
    .select('id', { count: 'exact', head: true })
    .eq('patient_id', user.id)
    .gte('created_at', rateWindowStart);
  if (rateError) return NextResponse.json({ error: 'Não foi possível validar o limite de análises.' }, { status: 503 });
  if ((recentAnalysisCount ?? 0) >= 10) {
    return NextResponse.json(
      { error: 'Você atingiu o limite de análises desta hora. Tente novamente mais tarde.' },
      { status: 429, headers: { 'Retry-After': '3600' } }
    );
  }

  const id = crypto.randomUUID();
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!hasValidImageSignature(bytes, file.type)) return NextResponse.json({ error: 'O conteúdo do arquivo não corresponde a uma imagem válida.' }, { status: 400 });
  const imageHash = crypto.createHash('sha256').update(bytes).digest('hex');
  const path = `${user.id}/meals/${id}.${extensionForMimeType(file.type)}`;
  const upload = await admin.storage.from('patient-media').upload(path, bytes, { contentType: file.type, upsert: false });
  if (upload.error) return NextResponse.json({ error: 'Não foi possível armazenar a foto.' }, { status: 500 });
  const pending = await admin.from('meal_photo_analyses').insert({ id, patient_id: user.id, storage_path: path, image_sha256: imageHash }).select('id').single();
  if (pending.error) {
    await admin.storage.from('patient-media').remove([path]);
    return NextResponse.json({ error: 'Não foi possível registrar a análise.' }, { status: 500 });
  }

  try {
    const { data: activePlan } = await admin.from('diet_plans').select('id').eq('patient_id', user.id).eq('is_active', true).maybeSingle();
    const result = await analyzeMealImage({ bytes, mimeType: file.type, hasActivePlan: Boolean(activePlan) });
    await admin.from('meal_photo_analyses').update({ status: 'completed', provider: 'gemini', model: result.model, analysis: result.analysis, completed_at: new Date().toISOString() }).eq('id', id).eq('patient_id', user.id);
    await logAuditEvent({ actorId: user.id, action: 'progress.meal_photo_analyzed', entityType: 'meal_photo_analyses', entityId: id, metadata: { model: result.model }, useAdminClient: true });
    return NextResponse.json({ success: true, id, analysis: result.analysis });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'AI_PROVIDER_ERROR';
    await admin.from('meal_photo_analyses').update({ status: 'failed', error_code: code, completed_at: new Date().toISOString() }).eq('id', id).eq('patient_id', user.id);
    const unavailable = code === 'AI_PROVIDER_UNAVAILABLE';
    return NextResponse.json({ error: unavailable ? 'A análise por IA ainda não está configurada neste ambiente.' : 'A IA não conseguiu analisar esta foto. Tente outra imagem.' }, { status: unavailable ? 503 : 502 });
  }
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Registro inválido.' }, { status: 400 });
  const admin = createAdminClient();
  const { data: meal } = await admin.from('meal_photo_analyses').select('storage_path').eq('id', id).eq('patient_id', user.id).maybeSingle();
  if (!meal) return NextResponse.json({ error: 'Registro não encontrado.' }, { status: 404 });
  const removed = await admin.storage.from('patient-media').remove([meal.storage_path]);
  if (removed.error) return NextResponse.json({ error: 'Não foi possível remover a imagem.' }, { status: 500 });
  await admin.from('meal_photo_analyses').delete().eq('id', id).eq('patient_id', user.id);
  await logAuditEvent({ actorId: user.id, action: 'progress.meal_photo_deleted', entityType: 'meal_photo_analyses', entityId: id, useAdminClient: true });
  return NextResponse.json({ success: true });
}
