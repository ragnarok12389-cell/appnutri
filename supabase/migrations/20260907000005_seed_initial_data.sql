-- ==============================================================================
-- MIGRATION: 20260907000005_seed_initial_data.sql
-- DESCRIPTION: Reference Documentation and Verification Fixtures
-- ==============================================================================

-- Verification query helper to test RBAC matrix in database
DO $$
BEGIN
    RAISE NOTICE '--- FUNDAÇÃO DE BANCO DE DADOS INSTALADA COM SUCESSO ---';
    RAISE NOTICE 'Roles cadastradas: %', (SELECT count(*) FROM public.roles);
    RAISE NOTICE 'Permissões cadastradas: %', (SELECT count(*) FROM public.permissions);
    RAISE NOTICE 'Mapeamento de permissões: %', (SELECT count(*) FROM public.role_permissions);
END $$;
