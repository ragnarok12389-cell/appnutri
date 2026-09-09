import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logAuditEvent } from '@/lib/audit/logger';
import { ProgressPhotoCheckpointSchema } from '@/types/patient-media';
import { extensionForMimeType, hasValidImageSignature, validatePatientImage } from '@/lib/patient-media/validation';

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });

  const form = await request.formData();
  const file = form.get('photo');
  const checkpoint = ProgressPhotoCheckpointSchema.safeParse(form.get('checkpoint'));
  const notes = form.get('notes')?.toString().trim() || null;
  if (!(file instanceof File) || !checkpoint.success || (notes?.length ?? 0) > 500) {
    return NextResponse.json({ error: 'Dados da foto inválidos.' }, { status: 400 });
  }
  const validationError = validatePatientImage(file);
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });

  const admin = createAdminClient();
  const id = crypto.randomUUID();
  const path = `${user.id}/progress/${checkpoint.data}/${id}.${extensionForMimeType(file.type)}`;
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!hasValidImageSignature(bytes, file.type)) return NextResponse.json({ error: 'O conteúdo do arquivo não corresponde a uma imagem válida.' }, { status: 400 });
  const upload = await admin.storage.from('patient-media').upload(path, bytes, { contentType: file.type, upsert: false });
  if (upload.error) return NextResponse.json({ error: 'Não foi possível armazenar a foto.' }, { status: 500 });

  const inserted = await admin.from('patient_progress_photos').insert({ id, patient_id: user.id, checkpoint: checkpoint.data, storage_path: path, notes }).select('id').single();
  if (inserted.error) {
    await admin.storage.from('patient-media').remove([path]);
    return NextResponse.json({ error: 'Não foi possível registrar a foto.' }, { status: 500 });
  }

  await logAuditEvent({ actorId: user.id, action: 'progress.photo_uploaded', entityType: 'patient_progress_photos', entityId: id, metadata: { checkpoint: checkpoint.data }, useAdminClient: true });
  return NextResponse.json({ success: true, id });
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Foto inválida.' }, { status: 400 });

  const admin = createAdminClient();
  const { data: photo } = await admin.from('patient_progress_photos').select('storage_path').eq('id', id).eq('patient_id', user.id).maybeSingle();
  if (!photo) return NextResponse.json({ error: 'Foto não encontrada.' }, { status: 404 });
  const removed = await admin.storage.from('patient-media').remove([photo.storage_path]);
  if (removed.error) return NextResponse.json({ error: 'Não foi possível remover a imagem.' }, { status: 500 });
  await admin.from('patient_progress_photos').delete().eq('id', id).eq('patient_id', user.id);
  await logAuditEvent({ actorId: user.id, action: 'progress.photo_deleted', entityType: 'patient_progress_photos', entityId: id, useAdminClient: true });
  return NextResponse.json({ success: true });
}
