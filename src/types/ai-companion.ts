import { z } from 'zod';

// ==============================================================================
// 1. ROLES E MENSAGENS CONVERSACIONAIS
// ==============================================================================

export type AIMessageRole = 'user' | 'assistant' | 'system' | 'tool';

export interface AIMessage {
  id: string;
  conversation_id: string;
  patient_id: string;
  role: AIMessageRole;
  content: string;
  tool_calls?: AIToolCall[];
  tool_call_id?: string;
  safety_flags: string[];
  prompt_tokens?: number;
  completion_tokens?: number;
  created_at: string;
}

export interface AIConversation {
  id: string;
  patient_id: string;
  title: string;
  is_active: boolean;
  context_summary?: string | null;
  summary_updated_at?: string | null;
  created_at: string;
  updated_at: string;
}

// ==============================================================================
// 2. SAFETY ENGINE & PRE-LLM CLASSIFIER
// ==============================================================================

export type SafetyCategory =
  | 'medical_emergency'
  | 'medication_prescription'
  | 'clinical_diagnosis'
  | 'extreme_diet_disorder'
  | 'self_harm'
  | 'safe';

export interface SafetyClassificationResult {
  is_safe: boolean;
  category: SafetyCategory;
  flags: string[];
  block_llm: boolean;
  safe_response_override?: string;
  recommended_action?: 'emergency_services' | 'physician_consultation' | 'nutritionist_consultation' | 'none';
}

// ==============================================================================
// 3. CONTEXT PACKS
// ==============================================================================

export interface ProfileContextPack {
  patient_id: string;
  full_name: string;
  objective: string;
  dietary_restrictions: string[];
  allergies: string[];
  movement_contraindications: string[];
}

export interface DietContextPack {
  has_active_plan: boolean;
  plan_id?: string;
  version?: number;
  composer_version?: string;
  today_day_label?: string;
  target_calories?: number;
  target_protein_g?: number;
  target_carbs_g?: number;
  target_fat_g?: number;
  today_meals: {
    meal_id: string;
    name: string;
    order: number;
    target_time?: string;
    items: {
      food_id: string;
      food_name: string;
      grams: number;
      calories: number;
      protein_g: number;
      carbs_g: number;
      fat_g: number;
      household_measure?: string;
    }[];
  }[];
}

export interface WorkoutContextPack {
  has_active_program: boolean;
  program_id?: string;
  split_type?: string;
  sessions_per_week?: number;
  today_session?: {
    session_id: string;
    name: string;
    session_focus: string;
    duration_minutes: number;
    exercises: {
      workout_exercise_id: string;
      exercise_id: string;
      name: string;
      movement_pattern: string;
      prescribed_sets: number;
      min_reps: number;
      max_reps: number;
      target_rir?: number;
      rest_seconds: number;
      progression_strategy: string;
    }[];
  } | null;
}

export interface ProgressContextPack {
  recent_sessions_completed: number;
  last_logged_session_date?: string;
}

export interface ConversationContextPack {
  recent_messages: {
    role: AIMessageRole;
    content: string;
  }[];
  context_summary?: string | null;
}

export interface AIContextAggregate {
  profile: ProfileContextPack;
  diet: DietContextPack;
  workout: WorkoutContextPack;
  progress: ProgressContextPack;
  conversation: ConversationContextPack;
  timestamp: string;
}

// ==============================================================================
// 4. PROVIDER ABSTRACTION
// ==============================================================================

export interface AIToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string; // JSON string
  };
}

export interface AIProviderMessage {
  role: AIMessageRole;
  content: string;
  tool_calls?: AIToolCall[];
  tool_call_id?: string;
}

export interface AIProviderToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema
}

export interface AIProviderResponse {
  content: string | null;
  tool_calls?: AIToolCall[];
  finish_reason: 'stop' | 'tool_calls' | 'length' | 'content_filter' | 'error';
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface AIProvider {
  readonly providerName: string;
  readonly modelName: string;
  generate(
    messages: AIProviderMessage[],
    tools?: AIProviderToolDefinition[],
    options?: { temperature?: number; maxTokens?: number }
  ): Promise<AIProviderResponse>;
}

// ==============================================================================
// 5. TOOL DEFINITIONS & EXECUTION
// ==============================================================================

export type AIToolName =
  | 'getActiveDietPlan'
  | 'getTodayMeals'
  | 'getFoodSubstitutionOptions'
  | 'getActiveWorkoutProgram'
  | 'getTodayWorkout'
  | 'getExerciseSubstitutionOptions'
  | 'getProgressSummary'
  | 'recordUserFeedback'
  | 'proposeFoodSubstitution'
  | 'applyAuthorizedFoodSubstitution';

export interface AIToolExecutionRecord {
  id: string;
  patient_id: string;
  conversation_id: string;
  tool_name: AIToolName;
  input_arguments: Record<string, unknown>;
  is_authorized: boolean;
  authorization_denial_reason?: string;
  requires_user_confirmation: boolean;
  confirmation_status: 'not_required' | 'pending' | 'confirmed' | 'cancelled' | 'expired';
  confirmation_token?: string;
  confirmation_expires_at?: string;
  execution_status: 'success' | 'failed' | 'blocked_safety' | 'blocked_auth' | 'pending_confirmation';
  output_payload?: unknown;
  error_message?: string;
  created_at: string;
}

// ==============================================================================
// 6. FEEDBACK EVENTS
// ==============================================================================

export type AIFeedbackType =
  | 'hunger_satiety'
  | 'meal_size'
  | 'taste_dislike'
  | 'exercise_difficulty'
  | 'exercise_discomfort'
  | 'workout_incomplete'
  | 'schedule_issue'
  | 'general_comment';

export interface AIFeedbackEvent {
  id: string;
  patient_id: string;
  conversation_id?: string;
  message_id?: string;
  feedback_type: AIFeedbackType;
  domain: 'nutrition' | 'workout' | 'general';
  target_entity_type?: 'food' | 'meal' | 'exercise' | 'session' | 'day' | 'program' | 'diet_plan';
  target_entity_id?: string;
  intensity_rating?: number;
  notes?: string;
  status: 'recorded' | 'processed_stage9' | 'dismissed';
  created_at: string;
}

// ==============================================================================
// 7. ZOD SCHEMAS FOR API INPUTS & TOOL ARGS
// ==============================================================================

export const ChatRequestSchema = z.object({
  conversation_id: z.string().uuid().optional(),
  message: z.string().min(1).max(1000),
});

export type ChatRequest = z.infer<typeof ChatRequestSchema>;

export const ConfirmActionRequestSchema = z.object({
  conversation_id: z.string().uuid(),
  confirmation_token: z.string().min(16),
  decision: z.enum(['confirm', 'cancel']),
});

export type ConfirmActionRequest = z.infer<typeof ConfirmActionRequestSchema>;

// Tool Argument Schemas
export const GetFoodSubstitutionArgsSchema = z.object({
  food_id: z.string().min(1),
  current_grams: z.number().positive().optional(),
});

export const GetExerciseSubstitutionArgsSchema = z.object({
  exercise_id: z.string().min(1),
});

export const RecordFeedbackArgsSchema = z.object({
  feedback_type: z.enum([
    'hunger_satiety',
    'meal_size',
    'taste_dislike',
    'exercise_difficulty',
    'exercise_discomfort',
    'workout_incomplete',
    'schedule_issue',
    'general_comment',
  ]),
  domain: z.enum(['nutrition', 'workout', 'general']),
  target_entity_type: z.enum(['food', 'meal', 'exercise', 'session', 'day', 'program', 'diet_plan']).optional(),
  target_entity_id: z.string().optional(),
  intensity_rating: z.number().int().min(1).max(5).optional(),
  notes: z.string().max(500).optional(),
});

export const ProposeFoodSubstitutionArgsSchema = z.object({
  meal_id: z.string().uuid(),
  current_food_id: z.string().min(1),
  replacement_food_id: z.string().min(1),
});

export const ApplyAuthorizedFoodSubstitutionArgsSchema = z.object({
  confirmation_token: z.string().min(16),
});
