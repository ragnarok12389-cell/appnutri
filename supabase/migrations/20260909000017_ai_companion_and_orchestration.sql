-- ==============================================================================
-- MIGRATION: 20260909000017_ai_companion_and_orchestration.sql
-- DESCRIPTION: Arquitetura do AI Companion Contextual, Seguro e Orquestrado:
--              Conversas, Mensagens, Feedbacks, Auditoria de Tools,
--              Confirmação de Ações, Rate Limits e RLS Estrito (ETAPA 8)
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. TABELA DE CONVERSAS DO AI COMPANION (ai_conversations)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ai_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
    title TEXT NOT NULL DEFAULT 'Conversa com Assistente',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    context_summary TEXT, -- Resumo narrativo compactado (informativo, nunca autoritativo)
    summary_updated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.timezone('utc', pg_catalog.now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.timezone('utc', pg_catalog.now())
);

CREATE INDEX IF NOT EXISTS idx_ai_conversations_patient ON public.ai_conversations(patient_id, is_active);
CREATE INDEX IF NOT EXISTS idx_ai_conversations_updated ON public.ai_conversations(updated_at DESC);

COMMENT ON TABLE public.ai_conversations IS 'Sessões conversacionais isoladas do AI Companion por paciente.';

-- ------------------------------------------------------------------------------
-- 2. TABELA DE MENSAGENS CONVERSACIONAIS (ai_messages)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ai_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES public.ai_conversations(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
    content TEXT NOT NULL,
    tool_calls JSONB, -- Estrutura de chamadas solicitadas pelo modelo
    tool_call_id TEXT, -- Referência quando role = 'tool'
    safety_flags TEXT[] NOT NULL DEFAULT '{}',
    prompt_tokens INT,
    completion_tokens INT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.timezone('utc', pg_catalog.now())
);

CREATE INDEX IF NOT EXISTS idx_ai_messages_conv ON public.ai_messages(conversation_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_ai_messages_patient ON public.ai_messages(patient_id);

COMMENT ON TABLE public.ai_messages IS 'Histórico de mensagens trocadas entre paciente e AI Companion.';

-- ------------------------------------------------------------------------------
-- 3. TABELA DE FEEDBACKS ESTRUTURADOS (ai_feedback_events)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ai_feedback_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
    conversation_id UUID REFERENCES public.ai_conversations(id) ON DELETE SET NULL,
    message_id UUID REFERENCES public.ai_messages(id) ON DELETE SET NULL,
    feedback_type TEXT NOT NULL CHECK (
        feedback_type IN (
            'hunger_satiety',       -- Fome excessiva ou saciedade precoce
            'meal_size',            -- Refeição muito grande ou pequena
            'taste_dislike',        -- Não gostou de alimento específico
            'exercise_difficulty',  -- Exercício muito difícil ou fácil
            'exercise_discomfort',  -- Desconforto articular ou biomecânico
            'workout_incomplete',   -- Não conseguiu completar a sessão
            'schedule_issue',       -- Falta de tempo na rotina
            'general_comment'       -- Comentário livre
        )
    ),
    domain TEXT NOT NULL CHECK (domain IN ('nutrition', 'workout', 'general')),
    target_entity_type TEXT CHECK (
        target_entity_type IN ('food', 'meal', 'exercise', 'session', 'day', 'program', 'diet_plan')
    ),
    target_entity_id TEXT,
    intensity_rating INT CHECK (intensity_rating IS NULL OR (intensity_rating >= 1 AND intensity_rating <= 5)),
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'recorded' CHECK (status IN ('recorded', 'processed_stage9', 'dismissed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.timezone('utc', pg_catalog.now())
);

CREATE INDEX IF NOT EXISTS idx_ai_feedback_patient ON public.ai_feedback_events(patient_id, domain);
CREATE INDEX IF NOT EXISTS idx_ai_feedback_status ON public.ai_feedback_events(status);

COMMENT ON TABLE public.ai_feedback_events IS 'Feedbacks estruturados capturados pelo Companion para auditoria e Etapa 9.';

-- ------------------------------------------------------------------------------
-- 4. TABELA DE AUDITORIA DE FERRAMENTAS E CONFIRMAÇÕES (ai_tool_executions)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ai_tool_executions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
    conversation_id UUID NOT NULL REFERENCES public.ai_conversations(id) ON DELETE CASCADE,
    tool_name TEXT NOT NULL,
    input_arguments JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_authorized BOOLEAN NOT NULL,
    authorization_denial_reason TEXT,
    requires_user_confirmation BOOLEAN NOT NULL DEFAULT FALSE,
    confirmation_status TEXT NOT NULL DEFAULT 'not_required' CHECK (
        confirmation_status IN ('not_required', 'pending', 'confirmed', 'cancelled', 'expired')
    ),
    confirmation_token TEXT,
    confirmation_expires_at TIMESTAMPTZ,
    execution_status TEXT NOT NULL CHECK (
        execution_status IN ('success', 'failed', 'blocked_safety', 'blocked_auth', 'pending_confirmation')
    ),
    output_payload JSONB,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.timezone('utc', pg_catalog.now())
);

CREATE INDEX IF NOT EXISTS idx_ai_tool_patient ON public.ai_tool_executions(patient_id);
CREATE INDEX IF NOT EXISTS idx_ai_tool_token ON public.ai_tool_executions(confirmation_token) WHERE confirmation_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ai_tool_conv ON public.ai_tool_executions(conversation_id);

COMMENT ON TABLE public.ai_tool_executions IS 'Auditoria server-side estrita de execuções de ferramentas e fluxo de confirmação.';

-- ------------------------------------------------------------------------------
-- 5. TABELA DE RATE LIMITING PERSISTIDO (ai_rate_limits)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ai_rate_limits (
    patient_id UUID PRIMARY KEY REFERENCES public.patients(id) ON DELETE CASCADE,
    message_count_current_hour INT NOT NULL DEFAULT 0,
    tool_count_current_hour INT NOT NULL DEFAULT 0,
    window_started_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.timezone('utc', pg_catalog.now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.timezone('utc', pg_catalog.now())
);

COMMENT ON TABLE public.ai_rate_limits IS 'Governança e proteção contra abuso de requisições de IA por paciente.';

-- ------------------------------------------------------------------------------
-- 6. PERMISSÕES E RBAC PARA O MÓDULO DE IA
-- ------------------------------------------------------------------------------
INSERT INTO public.permissions (id, name, module, description)
VALUES 
    ('ai.chat', 'Conversar com AI Companion', 'ai', 'Permite interagir via chat contextual com o AI Companion.'),
    ('ai.feedback.view', 'Visualizar Feedbacks de IA', 'ai', 'Permite aos profissionais visualizarem feedbacks de treino/dieta gerados pelo paciente.'),
    ('ai.admin', 'Administração de IA', 'ai', 'Permite auditar e gerenciar regras de execução do Companion.')
ON CONFLICT (id) DO UPDATE 
SET name = EXCLUDED.name, description = EXCLUDED.description;

-- Pacientes possuem acesso nativo ao chat
INSERT INTO public.role_permissions (role_id, permission_id)
VALUES 
    ('patient', 'ai.chat'),
    ('nutritionist', 'ai.feedback.view'),
    ('admin', 'ai.chat'),
    ('admin', 'ai.feedback.view'),
    ('admin', 'ai.admin')
ON CONFLICT DO NOTHING;

-- ------------------------------------------------------------------------------
-- 7. TRIGGERS DE SEGURANÇA E ATUALIZAÇÃO TEMPORAL
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.check_ai_message_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_role TEXT;
BEGIN
    v_role := COALESCE(current_setting('request.jwt.claim.role', true), '');

    IF v_role IN ('service_role', 'supabase_admin') THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    IF session_user IN ('postgres', 'supabase_admin')
       AND COALESCE(current_setting('role', true), 'none') = 'none'
       AND v_role = '' THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    IF TG_OP = 'INSERT' THEN
        -- Blindagem temporal: timestamp UTC do servidor
        NEW.created_at := pg_catalog.timezone('utc', pg_catalog.now());
        RETURN NEW;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        RAISE EXCEPTION 'Mensagens conversacionais do AI Companion são estritamente imutáveis após inserção.';
    END IF;

    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Deleção direta de mensagens conversacionais é proibida para fins de auditoria.';
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_ai_message_immutability ON public.ai_messages;
CREATE TRIGGER trg_ai_message_immutability
    BEFORE INSERT OR UPDATE OR DELETE ON public.ai_messages
    FOR EACH ROW
    EXECUTE FUNCTION private.check_ai_message_immutability();

-- ------------------------------------------------------------------------------
-- 8. ROW LEVEL SECURITY (RLS)
-- ------------------------------------------------------------------------------
ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_feedback_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_tool_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_rate_limits ENABLE ROW LEVEL SECURITY;

-- 8.1. AI_CONVERSATIONS
-- Paciente visualiza e gerencia apenas suas próprias conversas
CREATE POLICY "Patients view own ai conversations"
    ON public.ai_conversations FOR SELECT
    TO authenticated
    USING (private.is_patient_owner(patient_id, auth.uid()) OR private.is_admin(auth.uid()));

CREATE POLICY "Patients insert own ai conversations"
    ON public.ai_conversations FOR INSERT
    TO authenticated
    WITH CHECK (private.is_patient_owner(patient_id, auth.uid()));

CREATE POLICY "Patients update own ai conversations"
    ON public.ai_conversations FOR UPDATE
    TO authenticated
    USING (private.is_patient_owner(patient_id, auth.uid()) OR private.is_admin(auth.uid()))
    WITH CHECK (private.is_patient_owner(patient_id, auth.uid()) OR private.is_admin(auth.uid()));

-- 8.2. AI_MESSAGES
-- Paciente visualiza e insere mensagens apenas em conversas próprias
CREATE POLICY "Patients view own ai messages"
    ON public.ai_messages FOR SELECT
    TO authenticated
    USING (
        private.is_patient_owner(patient_id, auth.uid())
        OR private.is_admin(auth.uid())
    );

CREATE POLICY "Patients insert own ai messages"
    ON public.ai_messages FOR INSERT
    TO authenticated
    WITH CHECK (
        private.is_patient_owner(patient_id, auth.uid())
        AND EXISTS (
            SELECT 1 FROM public.ai_conversations ac
            WHERE ac.id = conversation_id
              AND private.is_patient_owner(ac.patient_id, auth.uid())
        )
    );

CREATE POLICY "Patients update own ai messages"
    ON public.ai_messages FOR UPDATE
    TO authenticated
    USING (
        private.is_patient_owner(patient_id, auth.uid())
        OR private.is_admin(auth.uid())
    );

-- 8.3. AI_FEEDBACK_EVENTS
CREATE POLICY "Patients view own ai feedback"
    ON public.ai_feedback_events FOR SELECT
    TO authenticated
    USING (
        private.is_patient_owner(patient_id, auth.uid())
        OR private.is_admin(auth.uid())
        OR (
            -- Profissionais com vínculo ativo podem ler feedbacks de seus pacientes vinculados
            private.can_access_patient(auth.uid(), patient_id)
            AND EXISTS (
                SELECT 1 FROM public.profiles pr
                JOIN public.role_permissions rp ON rp.role_id = pr.role_id
                WHERE pr.id = auth.uid() AND rp.permission_id = 'ai.feedback.view'
            )
        )
    );

CREATE POLICY "Patients insert own ai feedback"
    ON public.ai_feedback_events FOR INSERT
    TO authenticated
    WITH CHECK (private.is_patient_owner(patient_id, auth.uid()));

-- 8.4. AI_TOOL_EXECUTIONS
-- Apenas leitura pelo dono da sessão ou admin. Inserções/Updates são controladas pelo backend (service_role).
CREATE POLICY "Patients view own ai tool executions"
    ON public.ai_tool_executions FOR SELECT
    TO authenticated
    USING (private.is_patient_owner(patient_id, auth.uid()) OR private.is_admin(auth.uid()));

-- 8.5. AI_RATE_LIMITS
CREATE POLICY "Patients view own rate limits"
    ON public.ai_rate_limits FOR SELECT
    TO authenticated
    USING (private.is_patient_owner(patient_id, auth.uid()) OR private.is_admin(auth.uid()));

-- Permissões para service_role (backend orquestrador)
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN
        GRANT ALL ON TABLE public.ai_conversations TO service_role;
        GRANT ALL ON TABLE public.ai_messages TO service_role;
        GRANT ALL ON TABLE public.ai_feedback_events TO service_role;
        GRANT ALL ON TABLE public.ai_tool_executions TO service_role;
        GRANT ALL ON TABLE public.ai_rate_limits TO service_role;
    END IF;
END $$;
