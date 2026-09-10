-- ETAPA 11B: estado persistente da ativação automática após o questionário

ALTER TABLE public.patient_nutrition_profiles
  ADD COLUMN available_workout_equipment TEXT[] NOT NULL DEFAULT ARRAY['bodyweight']::TEXT[];

ALTER TABLE public.patient_nutrition_profiles
  ADD CONSTRAINT patient_nutrition_profiles_workout_equipment_valid
  CHECK (
    cardinality(available_workout_equipment) > 0
    AND available_workout_equipment <@ ARRAY[
      'barbell', 'dumbbell', 'cable', 'machine', 'bodyweight',
      'bench', 'pull_up_bar', 'resistance_band'
    ]::TEXT[]
  );

CREATE TABLE public.patient_plan_activations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  profile_version INTEGER NOT NULL CHECK (profile_version > 0),
  nutrition_status TEXT NOT NULL CHECK (
    nutrition_status IN ('processing', 'calculated', 'review_required', 'insufficient_data', 'failed')
  ),
  diet_status TEXT NOT NULL CHECK (
    diet_status IN ('processing', 'generated', 'review_required', 'failed', 'not_eligible')
  ),
  workout_status TEXT NOT NULL CHECK (
    workout_status IN ('processing', 'generated', 'review_required', 'failed', 'needs_configuration')
  ),
  messages JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(messages) = 'array'),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (patient_id, profile_version)
);

CREATE INDEX idx_patient_plan_activations_latest
  ON public.patient_plan_activations(patient_id, profile_version DESC);

ALTER TABLE public.patient_plan_activations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Patients view own plan activations"
  ON public.patient_plan_activations FOR SELECT TO authenticated
  USING (private.is_patient_owner(patient_id, auth.uid()) OR private.is_admin(auth.uid()));

REVOKE ALL ON public.patient_plan_activations FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.patient_plan_activations TO authenticated;
GRANT ALL ON public.patient_plan_activations TO service_role;

COMMENT ON TABLE public.patient_plan_activations IS
  'Estado operacional por versão do perfil para ativação automática dos motores nutricional, alimentar e de treino.';
