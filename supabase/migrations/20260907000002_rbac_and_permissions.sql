-- ==============================================================================
-- MIGRATION: 20260907000002_rbac_and_permissions.sql
-- DESCRIPTION: Initial Roles, Permissions, and Default Role Mappings
-- ==============================================================================

-- 1. SEED ROLES
INSERT INTO public.roles (id, name, description)
VALUES 
    ('admin', 'Administrador', 'Acesso total à governança da plataforma, auditoria e usuários.'),
    ('nutritionist', 'Nutricionista', 'Profissional de saúde credenciado com permissão para prescrever dietas e acompanhar pacientes.'),
    ('influencer', 'Influenciador', 'Criador de conteúdo fitness/nutrição com acesso a pacientes vinculados e programas de referência.'),
    ('patient', 'Paciente', 'Usuário final consumidor de planos alimentares, treinos e acompanhamento.')
ON CONFLICT (id) DO UPDATE 
SET name = EXCLUDED.name, description = EXCLUDED.description;

-- 2. SEED PERMISSIONS
INSERT INTO public.permissions (id, name, module, description)
VALUES
    -- Pacientes
    ('patient.view', 'Visualizar Pacientes', 'patients', 'Permite visualizar dados de pacientes vinculados.'),
    ('patient.edit', 'Editar Pacientes', 'patients', 'Permite editar anotações e dados de pacientes vinculados.'),
    
    -- Nutrição
    ('nutrition.view', 'Visualizar Nutrição', 'nutrition', 'Permite visualizar dietas e planos nutricionais.'),
    ('nutrition.edit', 'Editar Nutrição', 'nutrition', 'Permite prescrever e alterar planos nutricionais.'),
    
    -- Treino
    ('workout.view', 'Visualizar Treinos', 'workout', 'Permite visualizar fichas e cronogramas de treino.'),
    ('workout.edit', 'Editar Treinos', 'workout', 'Permite criar e alterar fichas de treino.'),
    
    -- Evolução
    ('progress.view', 'Visualizar Evolução', 'progress', 'Permite acompanhar evolução de medidas e peso.'),
    
    -- Inteligência Artificial
    ('ai.use', 'Utilizar IA', 'ai', 'Permite interagir com agentes e automações de IA.'),
    ('ai.manage', 'Gerenciar IA', 'ai', 'Permite configurar prompts e regras de IA no sistema.'),
    
    -- Produtos & Monetização
    ('products.manage', 'Gerenciar Produtos', 'products', 'Permite gerenciar catálogo e produtos digitais.'),
    ('entitlements.manage', 'Gerenciar Direitos', 'entitlements', 'Permite desbloquear ou revogar acessos de pacientes.'),
    ('billing.manage', 'Gerenciar Faturamento', 'billing', 'Permite gerenciar planos e faturamento.'),
    
    -- Governança & Usuários
    ('users.manage', 'Gerenciar Usuários', 'users', 'Permite administrar contas, papéis e suspensões.')
ON CONFLICT (id) DO UPDATE 
SET name = EXCLUDED.name, module = EXCLUDED.module, description = EXCLUDED.description;

-- 3. MAP ROLE PERMISSIONS

-- ADMIN: All permissions
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT 'admin', id FROM public.permissions
ON CONFLICT DO NOTHING;

-- NUTRITIONIST: Clinical management + view/edit nutrition and workout + progress + ai
INSERT INTO public.role_permissions (role_id, permission_id)
VALUES
    ('nutritionist', 'patient.view'),
    ('nutritionist', 'patient.edit'),
    ('nutritionist', 'nutrition.view'),
    ('nutritionist', 'nutrition.edit'),
    ('nutritionist', 'workout.view'),
    ('nutritionist', 'workout.edit'),
    ('nutritionist', 'progress.view'),
    ('nutritionist', 'ai.use')
ON CONFLICT DO NOTHING;

-- INFLUENCER: Non-clinical guidance, view linked patients, view content, progress, ai
INSERT INTO public.role_permissions (role_id, permission_id)
VALUES
    ('influencer', 'patient.view'),
    ('influencer', 'nutrition.view'),
    ('influencer', 'workout.view'),
    ('influencer', 'progress.view'),
    ('influencer', 'ai.use')
ON CONFLICT DO NOTHING;

-- PATIENT: Access to view personal plans, progress, and consumer AI features
INSERT INTO public.role_permissions (role_id, permission_id)
VALUES
    ('patient', 'nutrition.view'),
    ('patient', 'workout.view'),
    ('patient', 'progress.view'),
    ('patient', 'ai.use')
ON CONFLICT DO NOTHING;
