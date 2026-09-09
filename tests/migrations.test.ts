import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Supabase Migrations & Schema Architecture', () => {
  const migrationsDir = path.resolve(__dirname, '../supabase/migrations');

  it('should have all planned migration files including invites and onboarding', () => {
    const files = fs.readdirSync(migrationsDir);
    expect(files).toContain('20260907000001_initial_schema.sql');
    expect(files).toContain('20260907000002_rbac_and_permissions.sql');
    expect(files).toContain('20260907000003_rls_policies.sql');
    expect(files).toContain('20260907000004_audit_and_triggers.sql');
    expect(files).toContain('20260907000005_seed_initial_data.sql');
    expect(files).toContain('20260907000006_invites_and_onboarding.sql');
    expect(files).toContain('20260907000007_atomic_enrollment_and_rpc_wrappers.sql');
    expect(files).toContain('20260907000008_private_grants_and_email_verification.sql');
    expect(files).toContain('20260907000009_patient_nutrition_profile.sql');
    expect(files).toContain('20260908000010_deterministic_nutrition_engine.sql');
    expect(files).toContain('20260908000011_segregate_clinical_review_and_guardrails.sql');
    expect(files).toContain('20260908000012_food_database_and_pricing.sql');
    expect(files).toContain('20260908000013_food_semantics_and_custom_hardening.sql');
    expect(files).toContain('20260908000014_cross_tenant_and_governance_hardening.sql');
    expect(files).toContain('20260908000015_deterministic_diet_plans.sql');
    expect(files).toContain('20260909000016_deterministic_workout_engine.sql');
    expect(files).toContain('20260909000017_ai_companion_and_orchestration.sql');
    expect(files).toContain('20260909000018_ai_companion_runtime_hardening.sql');
  });

  it('should define all required domain tables in initial schema', () => {
    const schemaSql = fs.readFileSync(path.join(migrationsDir, '20260907000001_initial_schema.sql'), 'utf-8');

    const expectedTables = [
      'public.roles',
      'public.permissions',
      'public.role_permissions',
      'public.profiles',
      'public.user_permissions',
      'public.organizations',
      'public.organization_members',
      'public.professional_profiles',
      'public.patients',
      'public.professional_patient_links',
      'public.audit_logs',
    ];

    for (const table of expectedTables) {
      expect(schemaSql).toContain(table);
    }
  });

  it('should enforce distinct roles in rbac migration', () => {
    const rbacSql = fs.readFileSync(path.join(migrationsDir, '20260907000002_rbac_and_permissions.sql'), 'utf-8');

    expect(rbacSql).toContain("'admin'");
    expect(rbacSql).toContain("'nutritionist'");
    expect(rbacSql).toContain("'influencer'");
    expect(rbacSql).toContain("'patient'");

    // Verifies that nutritionist has nutrition.edit and influencer does not have it in its mapping
    expect(rbacSql).toMatch(/\('nutritionist',\s*'nutrition\.edit'\)/);
    expect(rbacSql).not.toMatch(/\('influencer',\s*'nutrition\.edit'\)/);
  });

  it('should define SECURITY DEFINER helper functions in private schema with search_path = \'\'', () => {
    const rlsSql = fs.readFileSync(path.join(migrationsDir, '20260907000003_rls_policies.sql'), 'utf-8');

    expect(rlsSql).toContain('CREATE SCHEMA IF NOT EXISTS private;');
    expect(rlsSql).toContain('FUNCTION private.get_user_role');
    expect(rlsSql).toContain('FUNCTION private.is_admin');
    expect(rlsSql).toContain('FUNCTION private.can_access_patient');
    expect(rlsSql).toContain('FUNCTION private.is_org_member');
    expect(rlsSql).toContain('FUNCTION private.can_manage_org_members');
    expect(rlsSql).toContain("SET search_path = ''");

    // All helper functions must have SECURITY DEFINER
    const secDefCount = (rlsSql.match(/SECURITY DEFINER/g) || []).length;
    expect(secDefCount).toBeGreaterThanOrEqual(6);
  });

  it('should enable RLS on every single domain table', () => {
    const rlsSql = fs.readFileSync(path.join(migrationsDir, '20260907000003_rls_policies.sql'), 'utf-8');

    const tables = [
      'roles',
      'permissions',
      'role_permissions',
      'profiles',
      'user_permissions',
      'organizations',
      'organization_members',
      'professional_profiles',
      'patients',
      'professional_patient_links',
      'audit_logs',
    ];

    for (const table of tables) {
      expect(rlsSql).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;`);
    }
  });

  it('should include audit logging procedure and anti-escalation trigger in triggers migration', () => {
    const triggerSql = fs.readFileSync(path.join(migrationsDir, '20260907000004_audit_and_triggers.sql'), 'utf-8');

    expect(triggerSql).toContain('FUNCTION public.enforce_profile_role_immutability');
    expect(triggerSql).toContain('FUNCTION public.handle_new_user');
    expect(triggerSql).toContain('FUNCTION public.log_audit_event');
    expect(triggerSql).toContain('trg_prevent_unauthorized_role_change');
  });

  it('should define professional_invites, patient_invites, patient_onboarding and accept_patient_invite RPC in migration 6', () => {
    const invitesSql = fs.readFileSync(path.join(migrationsDir, '20260907000006_invites_and_onboarding.sql'), 'utf-8');

    expect(invitesSql).toContain('TABLE IF NOT EXISTS public.professional_invites');
    expect(invitesSql).toContain('TABLE IF NOT EXISTS public.patient_invites');
    expect(invitesSql).toContain('TABLE IF NOT EXISTS public.patient_onboarding');
    expect(invitesSql).toContain('ALTER TABLE public.professional_invites ENABLE ROW LEVEL SECURITY;');
    expect(invitesSql).toContain('ALTER TABLE public.patient_invites ENABLE ROW LEVEL SECURITY;');
    expect(invitesSql).toContain('ALTER TABLE public.patient_onboarding ENABLE ROW LEVEL SECURITY;');
    expect(invitesSql).toContain('FUNCTION private.accept_patient_invite');
    expect(invitesSql).toContain('FOR UPDATE');
    expect(invitesSql).toContain("SET search_path = ''");
  });

  it('should define atomic handle_new_user and public RPC wrappers in migration 7', () => {
    const atomicSql = fs.readFileSync(path.join(migrationsDir, '20260907000007_atomic_enrollment_and_rpc_wrappers.sql'), 'utf-8');

    expect(atomicSql).toContain('FUNCTION public.handle_new_user');
    expect(atomicSql).toContain('patient_invite_token_hash');
    expect(atomicSql).toContain('professional_invite_token_hash');
    expect(atomicSql).toContain('FUNCTION public.validate_patient_invite');
    expect(atomicSql).toContain('FUNCTION public.validate_professional_invite');
    expect(atomicSql).toContain('FUNCTION public.accept_patient_invite');
    expect(atomicSql).toContain('REVOKE ALL ON SCHEMA private FROM PUBLIC, anon;');
  });

  it('should define private schema grants for RLS, drop redundant accept_patient_invite and configure email lifecycle in migration 8', () => {
    const mig8Sql = fs.readFileSync(path.join(migrationsDir, '20260907000008_private_grants_and_email_verification.sql'), 'utf-8');

    expect(mig8Sql).toContain('GRANT USAGE ON SCHEMA private TO authenticated');
    expect(mig8Sql).toContain('GRANT EXECUTE ON FUNCTION private.is_admin');
    expect(mig8Sql).toContain('GRANT EXECUTE ON FUNCTION private.is_professional');
    expect(mig8Sql).toContain('GRANT EXECUTE ON FUNCTION private.can_access_patient');
    expect(mig8Sql).toContain('GRANT EXECUTE ON FUNCTION private.is_org_member');
    expect(mig8Sql).toContain('GRANT EXECUTE ON FUNCTION private.can_manage_org_members');
    expect(mig8Sql).toContain('DROP FUNCTION IF EXISTS public.accept_patient_invite');
    expect(mig8Sql).toContain('pending_verification');
    expect(mig8Sql).toContain('FUNCTION public.handle_user_email_confirmed');
  });

  it('should define patient_nutrition_profiles, patient_nutrition_sensitive, snapshots and permissions in migration 9', () => {
    const mig9Sql = fs.readFileSync(path.join(migrationsDir, '20260907000009_patient_nutrition_profile.sql'), 'utf-8');

    expect(mig9Sql).toContain('TABLE IF NOT EXISTS public.patient_nutrition_profiles');
    expect(mig9Sql).toContain('TABLE IF NOT EXISTS public.patient_nutrition_sensitive');
    expect(mig9Sql).toContain('TABLE IF NOT EXISTS public.patient_nutrition_snapshots');
    expect(mig9Sql).toContain('TABLE IF NOT EXISTS public.patient_nutrition_sensitive_snapshots');
    expect(mig9Sql).toContain('nutrition_profile.view');
    expect(mig9Sql).toContain('nutrition_profile.edit');
    expect(mig9Sql).toContain('nutrition_sensitive.view');
    expect(mig9Sql).toContain('nutrition_sensitive.edit');
    expect(mig9Sql).toContain('FUNCTION private.can_view_nutrition_profile');
    expect(mig9Sql).toContain('FUNCTION private.can_edit_nutrition_profile');
    expect(mig9Sql).toContain('FUNCTION private.can_view_nutrition_sensitive');
    expect(mig9Sql).toContain('FUNCTION private.can_edit_nutrition_sensitive');
    expect(mig9Sql).toContain('ALTER TABLE public.patient_nutrition_profiles ENABLE ROW LEVEL SECURITY;');
    expect(mig9Sql).toContain('ALTER TABLE public.patient_nutrition_sensitive ENABLE ROW LEVEL SECURITY;');
  });

  it('should define clinical notes, engine runs, targets and rls in migration 10', () => {
    const mig10Sql = fs.readFileSync(path.join(migrationsDir, '20260908000010_deterministic_nutrition_engine.sql'), 'utf-8');

    expect(mig10Sql).toContain('TABLE IF NOT EXISTS public.patient_professional_clinical_notes');
    expect(mig10Sql).toContain('TABLE IF NOT EXISTS public.nutrition_engine_runs');
    expect(mig10Sql).toContain('TABLE IF NOT EXISTS public.nutrition_targets');
    expect(mig10Sql).toContain('nutrition_engine.run');
    expect(mig10Sql).toContain('nutrition_engine.view');
    expect(mig10Sql).toContain('nutrition_engine.review');
    expect(mig10Sql).toContain('FUNCTION private.can_view_engine_run');
    expect(mig10Sql).toContain('FUNCTION private.can_view_engine_clinical_details');
    expect(mig10Sql).toContain('FUNCTION private.can_execute_engine');
    expect(mig10Sql).toContain('FUNCTION private.can_review_engine');
    expect(mig10Sql).toContain('ALTER TABLE public.patient_professional_clinical_notes ENABLE ROW LEVEL SECURITY;');
    expect(mig10Sql).toContain('ALTER TABLE public.nutrition_engine_runs ENABLE ROW LEVEL SECURITY;');
    expect(mig10Sql).toContain('ALTER TABLE public.nutrition_targets ENABLE ROW LEVEL SECURITY;');
  });

  it('should define segregated clinical review table, structured condition flag and guardrails in migration 11', () => {
    const mig11Sql = fs.readFileSync(path.join(migrationsDir, '20260908000011_segregate_clinical_review_and_guardrails.sql'), 'utf-8');

    expect(mig11Sql).toContain('has_reported_clinical_condition');
    expect(mig11Sql).toContain('TABLE IF NOT EXISTS public.nutrition_engine_clinical_reviews');
    expect(mig11Sql).toContain('ALTER TABLE public.nutrition_engine_clinical_reviews ENABLE ROW LEVEL SECURITY;');
    expect(mig11Sql).toContain('raw_target_calories_nominal_kcal');
    expect(mig11Sql).toContain('target_was_clamped');
    expect(mig11Sql).toContain('clamp_reason');
    expect(mig11Sql).toContain('macro_reference_weight_strategy');
    expect(mig11Sql).toContain('can_view_engine_clinical_details');
    expect(mig11Sql).toContain('REVOKE INSERT ON public.nutrition_engine_clinical_reviews');
    expect(mig11Sql).toContain('enforce_clinical_review_immutability');
    expect(mig11Sql).toContain('trg_clinical_review_immutability');
  });

  it('should define food database, nutrients catalog, household measures, tags and pricing in migration 12', () => {
    const mig12Sql = fs.readFileSync(path.join(migrationsDir, '20260908000012_food_database_and_pricing.sql'), 'utf-8');

    expect(mig12Sql).toContain('TABLE IF NOT EXISTS public.food_data_sources');
    expect(mig12Sql).toContain('TABLE IF NOT EXISTS public.foods');
    expect(mig12Sql).toContain('TABLE IF NOT EXISTS public.nutrients');
    expect(mig12Sql).toContain('TABLE IF NOT EXISTS public.food_nutrients');
    expect(mig12Sql).toContain('TABLE IF NOT EXISTS public.food_household_measures');
    expect(mig12Sql).toContain('TABLE IF NOT EXISTS public.food_aliases');
    expect(mig12Sql).toContain('TABLE IF NOT EXISTS public.food_categories');
    expect(mig12Sql).toContain('TABLE IF NOT EXISTS public.food_tags');
    expect(mig12Sql).toContain('TABLE IF NOT EXISTS public.food_price_observations');
    expect(mig12Sql).toContain('TABLE IF NOT EXISTS public.food_availability');
    expect(mig12Sql).toContain('ALTER TABLE public.foods ENABLE ROW LEVEL SECURITY;');
    expect(mig12Sql).toContain('ALTER TABLE public.food_nutrients ENABLE ROW LEVEL SECURITY;');
    expect(mig12Sql).toContain('ALTER TABLE public.food_price_observations ENABLE ROW LEVEL SECURITY;');
  });

  it('should define TACO official semantics, immutability triggers and custom rules in migration 13', () => {
    const mig13Sql = fs.readFileSync(path.join(migrationsDir, '20260908000013_food_semantics_and_custom_hardening.sql'), 'utf-8');

    expect(mig13Sql).toContain('ADD COLUMN IF NOT EXISTS raw_value TEXT');
    expect(mig13Sql).toContain('ADD COLUMN IF NOT EXISTS numeric_value NUMERIC(10,4)');
    expect(mig13Sql).toContain('ADD COLUMN IF NOT EXISTS value_status TEXT');
    expect(mig13Sql).toContain('ADD COLUMN IF NOT EXISTS validation_status TEXT');
    expect(mig13Sql).toContain('ADD COLUMN IF NOT EXISTS alias_type TEXT');
    expect(mig13Sql).toContain('check_official_food_immutability');
    expect(mig13Sql).toContain('check_official_nutrient_immutability');
    expect(mig13Sql).toContain('check_professional_custom_rules');
    expect(mig13Sql).toContain('trg_official_food_immutability');
  });

  it('should define cross-tenant isolation, UNIQUE constraint, measure provenance and price governance in migration 14', () => {
    const mig14Sql = fs.readFileSync(path.join(migrationsDir, '20260908000014_cross_tenant_and_governance_hardening.sql'), 'utf-8');

    expect(mig14Sql).toContain('uq_food_data_sources_name_version UNIQUE (name, version)');
    expect(mig14Sql).toContain('source_id UUID REFERENCES public.food_data_sources(id)');
    expect(mig14Sql).toContain('source_reference TEXT');
    expect(mig14Sql).toContain('organization_id UUID REFERENCES public.organizations(id)');
    expect(mig14Sql).toContain('retailer TEXT');
    expect(mig14Sql).toContain('brand TEXT');
    expect(mig14Sql).toContain('valid_until TIMESTAMPTZ');
    expect(mig14Sql).toContain('check_price_observation_governance');
    expect(mig14Sql).toContain('Scoped read food_nutrients');
    expect(mig14Sql).toContain('Scoped read food_household_measures');
    expect(mig14Sql).toContain('Scoped read food_aliases');
    expect(mig14Sql).toContain('Scoped read food_category_mappings');
    expect(mig14Sql).toContain('Scoped read food_tag_mappings');
    expect(mig14Sql).toContain('Scoped read food_price_observations');

    // Confirm that empty string '' was removed from bypass check
    expect(mig14Sql).not.toMatch(/v_role IN \('service_role', 'supabase_admin', ''\)/);
  });

  it('should define diet plans, days, meals, items with snapshots, reviews and RLS in migration 15', () => {
    const mig15Sql = fs.readFileSync(path.join(migrationsDir, '20260908000015_deterministic_diet_plans.sql'), 'utf-8');

    expect(mig15Sql).toContain('TABLE IF NOT EXISTS public.diet_plans');
    expect(mig15Sql).toContain('TABLE IF NOT EXISTS public.diet_plan_days');
    expect(mig15Sql).toContain('TABLE IF NOT EXISTS public.diet_meals');
    expect(mig15Sql).toContain('TABLE IF NOT EXISTS public.diet_meal_items');
    expect(mig15Sql).toContain('TABLE IF NOT EXISTS public.diet_plan_reviews');
    expect(mig15Sql).toContain('uq_active_diet_plan_per_patient');
    expect(mig15Sql).toContain('composition_snapshot_hash');
    expect(mig15Sql).toContain('check_diet_plan_immutability');
    expect(mig15Sql).toContain('private.can_view_diet_plan');
    expect(mig15Sql).toContain('generation_reference_at TIMESTAMPTZ');
    expect(mig15Sql).toContain('source_id UUID REFERENCES public.food_data_sources(id)');
    expect(mig15Sql).toContain('source_food_code TEXT');
    expect(mig15Sql).toContain('FUNCTION public.persist_diet_plan_atomic');
    expect(mig15Sql).toContain('REVOKE ALL ON FUNCTION public.persist_diet_plan_atomic(JSONB, BOOLEAN) FROM PUBLIC, anon, authenticated;');
    expect(mig15Sql).toContain('GRANT EXECUTE ON FUNCTION public.persist_diet_plan_atomic(JSONB, BOOLEAN) TO service_role;');
    expect(mig15Sql).toContain('ALTER TABLE public.diet_plans ENABLE ROW LEVEL SECURITY;');
    expect(mig15Sql).toContain('ALTER TABLE public.diet_meal_items ENABLE ROW LEVEL SECURITY;');
    expect(mig15Sql).toContain("'diet_plan.generate'");
    expect(mig15Sql).toContain("'diet_plan.review'");
    expect(mig15Sql).toContain("'diet_plan.edit'");
  });

  it('should define exercise catalog, workout programs, days, sessions, exercises, progression and atomic RPC in migration 16', () => {
    const mig16Sql = fs.readFileSync(path.join(migrationsDir, '20260909000016_deterministic_workout_engine.sql'), 'utf-8');

    expect(mig16Sql).toContain('TABLE IF NOT EXISTS public.exercise_catalog');
    expect(mig16Sql).toContain('TABLE IF NOT EXISTS public.workout_programs');
    expect(mig16Sql).toContain('TABLE IF NOT EXISTS public.workout_program_days');
    expect(mig16Sql).toContain('TABLE IF NOT EXISTS public.workout_sessions');
    expect(mig16Sql).toContain('TABLE IF NOT EXISTS public.workout_exercises');
    expect(mig16Sql).toContain('TABLE IF NOT EXISTS public.workout_exercise_sets');
    expect(mig16Sql).toContain('TABLE IF NOT EXISTS public.workout_execution_logs');
    expect(mig16Sql).toContain('TABLE IF NOT EXISTS public.workout_progression_events');
    expect(mig16Sql).toContain('TABLE IF NOT EXISTS public.workout_reviews');
    expect(mig16Sql).toContain('uq_active_workout_program_per_patient');
    expect(mig16Sql).toContain('check_workout_program_immutability');
    expect(mig16Sql).toContain('private.can_view_workout_program');
    expect(mig16Sql).toContain('private.can_manage_workout_program');
    expect(mig16Sql).toContain('FUNCTION public.persist_workout_program_atomic');
    expect(mig16Sql).toContain('REVOKE ALL ON FUNCTION public.persist_workout_program_atomic(JSONB, BOOLEAN) FROM PUBLIC, anon, authenticated;');
    expect(mig16Sql).toContain('GRANT EXECUTE ON FUNCTION public.persist_workout_program_atomic(JSONB, BOOLEAN) TO service_role;');
    expect(mig16Sql).toContain('ALTER TABLE public.workout_programs ENABLE ROW LEVEL SECURITY;');
    expect(mig16Sql).toContain('ALTER TABLE public.workout_exercises ENABLE ROW LEVEL SECURITY;');
  });

  it('should define ai_conversations, ai_messages, ai_feedback_events, ai_tool_executions, and RLS in migration 17', () => {
    const mig17Sql = fs.readFileSync(path.join(migrationsDir, '20260909000017_ai_companion_and_orchestration.sql'), 'utf-8');

    expect(mig17Sql).toContain('TABLE IF NOT EXISTS public.ai_conversations');
    expect(mig17Sql).toContain('TABLE IF NOT EXISTS public.ai_messages');
    expect(mig17Sql).toContain('TABLE IF NOT EXISTS public.ai_feedback_events');
    expect(mig17Sql).toContain('TABLE IF NOT EXISTS public.ai_tool_executions');
    expect(mig17Sql).toContain('TABLE IF NOT EXISTS public.ai_rate_limits');
    expect(mig17Sql).toContain('check_ai_message_immutability');
    expect(mig17Sql).toContain('ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY;');
    expect(mig17Sql).toContain('ALTER TABLE public.ai_messages ENABLE ROW LEVEL SECURITY;');
    expect(mig17Sql).toContain('ALTER TABLE public.ai_feedback_events ENABLE ROW LEVEL SECURITY;');
    expect(mig17Sql).toContain('ALTER TABLE public.ai_tool_executions ENABLE ROW LEVEL SECURITY;');
    expect(mig17Sql).toContain('ALTER TABLE public.ai_rate_limits ENABLE ROW LEVEL SECURITY;');
    expect(mig17Sql).toContain("'ai.chat'");
    expect(mig17Sql).toContain("'ai.feedback.view'");
    expect(mig17Sql).toContain("'ai.admin'");
  });

  it('should harden AI runtime concurrency and keep privileged RPCs server-only in migration 18', () => {
    const sql = fs.readFileSync(
      path.join(migrationsDir, '20260909000018_ai_companion_runtime_hardening.sql'),
      'utf-8'
    );

    expect(sql).toContain('FUNCTION public.consume_ai_rate_limit');
    expect(sql).toContain('FUNCTION public.claim_ai_pending_action');
    expect(sql).toContain('FUNCTION public.finalize_ai_pending_action');
    expect(sql).toContain('FUNCTION public.cancel_ai_pending_action');
    expect(sql).toContain('FOR UPDATE');
    expect(sql).toContain('uq_ai_tool_confirmation_token');
    expect(sql).toContain('dp.patient_id = p_patient_id');
    expect(sql).toContain('dp.approval_status = \'approved\'');
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.claim_ai_pending_action');
    expect(sql).toContain('TO service_role');
  });

  it('should define append-only progress history and server-only adjustment RPCs in migration 19', () => {
    const sql = fs.readFileSync(
      path.join(migrationsDir, '20260909000019_progress_feedback_adjustments.sql'),
      'utf-8'
    );

    expect(sql).toContain('TABLE public.patient_check_ins');
    expect(sql).toContain('TABLE public.progress_analyses');
    expect(sql).toContain('TABLE public.adjustment_proposals');
    expect(sql).toContain('TABLE public.adjustment_proposal_reviews');
    expect(sql).toContain('private.block_progress_history_mutation');
    expect(sql).toContain('private.can_view_patient_progress');
    expect(sql).toContain('FUNCTION public.persist_progress_analysis_atomic');
    expect(sql).toContain('FUNCTION public.review_adjustment_proposal');
    expect(sql).toContain('pg_advisory_xact_lock');
    expect(sql).toContain('FROM PUBLIC, anon, authenticated');
    expect(sql).toContain('TO service_role');
  });

  it('should define server-authoritative products and entitlements in migration 20', () => {
    const sql = fs.readFileSync(path.join(migrationsDir, '20260909000020_products_and_entitlements.sql'), 'utf-8');
    expect(sql).toContain('TABLE public.products');
    expect(sql).toContain('TABLE public.product_features');
    expect(sql).toContain('TABLE public.user_entitlements');
    expect(sql).toContain('TABLE public.entitlement_events');
    expect(sql).toContain('feature_snapshot');
    expect(sql).toContain('FUNCTION public.has_my_entitlement');
    expect(sql).toContain('FUNCTION public.grant_user_entitlement');
    expect(sql).toContain('FUNCTION public.revoke_user_entitlement');
    expect(sql).toContain('FROM PUBLIC, anon, authenticated');
  });
});
