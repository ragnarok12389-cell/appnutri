-- ETAPA 11A: mídia privada de progresso e análise visual de refeições

DO $$
BEGIN
  IF to_regclass('storage.buckets') IS NOT NULL THEN
    EXECUTE $storage$
      INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
      VALUES ('patient-media', 'patient-media', FALSE, 8388608, ARRAY['image/jpeg', 'image/png', 'image/webp'])
      ON CONFLICT (id) DO UPDATE SET public = FALSE, file_size_limit = EXCLUDED.file_size_limit,
        allowed_mime_types = EXCLUDED.allowed_mime_types
    $storage$;
  END IF;
END $$;

CREATE TABLE public.patient_progress_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  checkpoint TEXT NOT NULL CHECK (checkpoint IN ('start', 'midpoint', 'goal')),
  storage_path TEXT NOT NULL UNIQUE,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT CHECK (notes IS NULL OR char_length(notes) <= 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_patient_progress_photos_timeline
  ON public.patient_progress_photos(patient_id, captured_at DESC);

CREATE TABLE public.meal_photo_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL UNIQUE,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),
  provider TEXT,
  model TEXT,
  image_sha256 TEXT NOT NULL CHECK (image_sha256 ~ '^[0-9a-f]{64}$'),
  analysis JSONB,
  error_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  CHECK ((status = 'completed' AND analysis IS NOT NULL AND completed_at IS NOT NULL) OR status <> 'completed')
);

CREATE INDEX idx_meal_photo_analyses_timeline
  ON public.meal_photo_analyses(patient_id, captured_at DESC);

ALTER TABLE public.patient_progress_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meal_photo_analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Patients manage own progress photos"
  ON public.patient_progress_photos FOR ALL TO authenticated
  USING (private.is_patient_owner(patient_id, auth.uid()))
  WITH CHECK (private.is_patient_owner(patient_id, auth.uid()));

CREATE POLICY "Patients view own meal analyses"
  ON public.meal_photo_analyses FOR SELECT TO authenticated
  USING (private.is_patient_owner(patient_id, auth.uid()));

GRANT SELECT, INSERT, DELETE ON public.patient_progress_photos TO authenticated;
GRANT SELECT ON public.meal_photo_analyses TO authenticated;
GRANT ALL ON public.patient_progress_photos, public.meal_photo_analyses TO service_role;

DO $$
BEGIN
  IF to_regclass('storage.objects') IS NOT NULL THEN
    EXECUTE 'CREATE POLICY "Patients upload own private media" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = ''patient-media'' AND (storage.foldername(name))[1] = auth.uid()::text)';
    EXECUTE 'CREATE POLICY "Patients read own private media" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = ''patient-media'' AND (storage.foldername(name))[1] = auth.uid()::text)';
    EXECUTE 'CREATE POLICY "Patients delete own private media" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = ''patient-media'' AND (storage.foldername(name))[1] = auth.uid()::text)';
  END IF;
END $$;

COMMENT ON TABLE public.patient_progress_photos IS 'Fotos corporais privadas registradas pelo próprio paciente em marcos da jornada.';
COMMENT ON TABLE public.meal_photo_analyses IS 'Fotos privadas de refeições e estimativas educativas produzidas por visão computacional.';
