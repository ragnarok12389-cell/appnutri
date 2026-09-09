import { UserRole } from './roles';

export type AppPermission =
  // Pacientes
  | 'patient.view'
  | 'patient.edit'
  // Nutrição
  | 'nutrition.view'
  | 'nutrition.edit'
  | 'nutrition_profile.view'
  | 'nutrition_profile.edit'
  | 'nutrition_sensitive.view'
  | 'nutrition_engine.run'
  | 'nutrition_engine.view'
  | 'nutrition_engine.review'
  // Alimentos e Preços (Etapa 5)
  | 'foods.view'
  | 'foods.manage'
  | 'food_prices.view'
  | 'food_prices.manage'
  // Planos Alimentares e Trocas (Etapa 6)
  | 'diet_plan.generate'
  | 'diet_plan.view'
  | 'diet_plan.review'
  | 'diet_plan.edit'
  // Treinos
  | 'workout.view'
  | 'workout.edit'
  // Progresso / Medidas
  | 'progress.view'
  // Inteligência Artificial
  | 'ai.use'
  | 'ai.manage'
  // Produtos & Direitos
  | 'products.manage'
  | 'entitlements.manage'
  // Governança & Faturamento
  | 'billing.manage'
  | 'users.manage';

export const ALL_PERMISSIONS: AppPermission[] = [
  'patient.view',
  'patient.edit',
  'nutrition.view',
  'nutrition.edit',
  'nutrition_profile.view',
  'nutrition_profile.edit',
  'nutrition_sensitive.view',
  'nutrition_engine.run',
  'nutrition_engine.view',
  'nutrition_engine.review',
  'foods.view',
  'foods.manage',
  'food_prices.view',
  'food_prices.manage',
  'diet_plan.generate',
  'diet_plan.view',
  'diet_plan.review',
  'diet_plan.edit',
  'workout.view',
  'workout.edit',
  'progress.view',
  'ai.use',
  'ai.manage',
  'products.manage',
  'entitlements.manage',
  'billing.manage',
  'users.manage',
];

/**
 * Matriz de permissões padrão por papel de usuário (RBAC Base).
 * Observação crucial: Nutricionista e Influencer possuem atribuições distintas!
 * O Nutricionista possui capacidade clínica ('nutrition.edit', 'workout.edit', 'nutrition_sensitive.view', 'nutrition_engine.run', 'nutrition_engine.review', 'food_prices.manage').
 * O Influenciador NÃO possui prerrogativa de execução, revisão ou visualização de dados clínicos sensíveis.
 */
export const ROLE_DEFAULT_PERMISSIONS: Record<UserRole, AppPermission[]> = {
  admin: [...ALL_PERMISSIONS],
  nutritionist: [
    'patient.view',
    'patient.edit',
    'nutrition.view',
    'nutrition.edit',
    'nutrition_profile.view',
    'nutrition_profile.edit',
    'nutrition_sensitive.view',
    'nutrition_engine.run',
    'nutrition_engine.view',
    'nutrition_engine.review',
    'foods.view',
    'food_prices.view',
    'food_prices.manage',
    'diet_plan.generate',
    'diet_plan.view',
    'diet_plan.review',
    'diet_plan.edit',
    'workout.view',
    'workout.edit',
    'progress.view',
    'ai.use',
  ],
  influencer: [
    'patient.view',
    'nutrition.view',
    'nutrition_profile.view',
    'nutrition_engine.view',
    'foods.view',
    'food_prices.view',
    'workout.view',
    'progress.view',
    'ai.use',
  ],
  patient: [
    'nutrition.view',
    'nutrition_profile.view',
    'nutrition_profile.edit',
    'nutrition_sensitive.view',
    'nutrition_engine.view',
    'foods.view',
    'food_prices.view',
    'diet_plan.generate',
    'diet_plan.view',
    'workout.view',
    'progress.view',
    'ai.use',
  ],
};
