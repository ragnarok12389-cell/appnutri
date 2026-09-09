/**
 * Templates Determinísticos de Divisão Semanal (ETAPA 7)
 * Mapeamentos estritos para 2 a 6 sessões semanais.
 * Versionado e reproduzível (WORKOUT_ENGINE_VERSION = '1.0.0').
 */

import { MovementPattern, SplitType, MuscleGroup } from '@/types/workout-engine';

export interface SessionSlotTemplate {
  slot_order: number;
  pattern: MovementPattern;
  target_muscle: MuscleGroup;
  prefer_compound: boolean;
}

export interface DayTemplate {
  day_of_week: number; // 1 = Seg, 2 = Ter, 3 = Qua, 4 = Qui, 5 = Sex, 6 = Sáb, 7 = Dom
  day_label: string;
  is_rest_day: boolean;
  session_name?: string;
  session_focus?: string;
  slots?: SessionSlotTemplate[];
}

export interface SplitTemplate {
  split_type: SplitType;
  sessions_per_week: number;
  description: string;
  days: DayTemplate[];
}

export const SPLIT_TEMPLATES: Record<number, SplitTemplate> = {
  // ==========================================================================
  // 2 SESSÕES POR SEMANA (Full Body A / B com recuperação intercalada)
  // ==========================================================================
  2: {
    split_type: 'full_body',
    sessions_per_week: 2,
    description: 'Divisão de Corpo Inteiro em 2 dias (Terça e Quinta) com estímulo global balanceado.',
    days: [
      { day_of_week: 1, day_label: 'Segunda-feira', is_rest_day: true },
      {
        day_of_week: 2,
        day_label: 'Terça-feira',
        is_rest_day: false,
        session_name: 'Sessão A — Full Body (Foco Push & Joelho)',
        session_focus: 'full_body_a',
        slots: [
          { slot_order: 1, pattern: 'squat', target_muscle: 'quadriceps', prefer_compound: true },
          { slot_order: 2, pattern: 'push_horizontal', target_muscle: 'chest', prefer_compound: true },
          { slot_order: 3, pattern: 'pull_horizontal', target_muscle: 'back', prefer_compound: true },
          { slot_order: 4, pattern: 'hinge', target_muscle: 'hamstrings', prefer_compound: true },
          { slot_order: 5, pattern: 'push_vertical', target_muscle: 'shoulders', prefer_compound: true },
          { slot_order: 6, pattern: 'core', target_muscle: 'core', prefer_compound: false },
        ],
      },
      { day_of_week: 3, day_label: 'Quarta-feira', is_rest_day: true },
      {
        day_of_week: 4,
        day_label: 'Quinta-feira',
        is_rest_day: false,
        session_name: 'Sessão B — Full Body (Foco Pull & Quadril)',
        session_focus: 'full_body_b',
        slots: [
          { slot_order: 1, pattern: 'hinge', target_muscle: 'glutes', prefer_compound: true },
          { slot_order: 2, pattern: 'pull_vertical', target_muscle: 'back', prefer_compound: true },
          { slot_order: 3, pattern: 'lunge', target_muscle: 'quadriceps', prefer_compound: true },
          { slot_order: 4, pattern: 'push_horizontal', target_muscle: 'chest', prefer_compound: true },
          { slot_order: 5, pattern: 'isolation', target_muscle: 'biceps', prefer_compound: false },
          { slot_order: 6, pattern: 'isolation', target_muscle: 'triceps', prefer_compound: false },
        ],
      },
      { day_of_week: 5, day_label: 'Sexta-feira', is_rest_day: true },
      { day_of_week: 6, day_label: 'Sábado', is_rest_day: true },
      { day_of_week: 7, day_label: 'Domingo', is_rest_day: true },
    ],
  },

  // ==========================================================================
  // 3 SESSÕES POR SEMANA (Full Body A / B / C - Seg, Qua, Sex)
  // ==========================================================================
  3: {
    split_type: 'full_body',
    sessions_per_week: 3,
    description: 'Divisão de Corpo Inteiro clássica em 3 dias alternados (Segunda, Quarta, Sexta).',
    days: [
      {
        day_of_week: 1,
        day_label: 'Segunda-feira',
        is_rest_day: false,
        session_name: 'Sessão A — Full Body (Força e Compostos Pesados)',
        session_focus: 'full_body_1',
        slots: [
          { slot_order: 1, pattern: 'squat', target_muscle: 'quadriceps', prefer_compound: true },
          { slot_order: 2, pattern: 'push_horizontal', target_muscle: 'chest', prefer_compound: true },
          { slot_order: 3, pattern: 'pull_horizontal', target_muscle: 'back', prefer_compound: true },
          { slot_order: 4, pattern: 'hinge', target_muscle: 'hamstrings', prefer_compound: true },
          { slot_order: 5, pattern: 'core', target_muscle: 'core', prefer_compound: false },
        ],
      },
      { day_of_week: 2, day_label: 'Terça-feira', is_rest_day: true },
      {
        day_of_week: 3,
        day_label: 'Quarta-feira',
        is_rest_day: false,
        session_name: 'Sessão B — Full Body (Puxar Vertical & Hip Thrust)',
        session_focus: 'full_body_2',
        slots: [
          { slot_order: 1, pattern: 'hinge', target_muscle: 'glutes', prefer_compound: true },
          { slot_order: 2, pattern: 'pull_vertical', target_muscle: 'back', prefer_compound: true },
          { slot_order: 3, pattern: 'push_vertical', target_muscle: 'shoulders', prefer_compound: true },
          { slot_order: 4, pattern: 'lunge', target_muscle: 'quadriceps', prefer_compound: true },
          { slot_order: 5, pattern: 'isolation', target_muscle: 'biceps', prefer_compound: false },
        ],
      },
      { day_of_week: 4, day_label: 'Quinta-feira', is_rest_day: true },
      {
        day_of_week: 5,
        day_label: 'Sexta-feira',
        is_rest_day: false,
        session_name: 'Sessão C — Full Body (Densidade & Estabilização)',
        session_focus: 'full_body_3',
        slots: [
          { slot_order: 1, pattern: 'squat', target_muscle: 'quadriceps', prefer_compound: true },
          { slot_order: 2, pattern: 'push_horizontal', target_muscle: 'chest', prefer_compound: true },
          { slot_order: 3, pattern: 'pull_horizontal', target_muscle: 'back', prefer_compound: true },
          { slot_order: 4, pattern: 'isolation', target_muscle: 'triceps', prefer_compound: false },
          { slot_order: 5, pattern: 'isolation', target_muscle: 'calves', prefer_compound: false },
        ],
      },
      { day_of_week: 6, day_label: 'Sábado', is_rest_day: true },
      { day_of_week: 7, day_label: 'Domingo', is_rest_day: true },
    ],
  },

  // ==========================================================================
  // 4 SESSÕES POR SEMANA (Upper / Lower A e B - Seg, Ter, Qui, Sex)
  // ==========================================================================
  4: {
    split_type: 'upper_lower',
    sessions_per_week: 4,
    description: 'Divisão Superior / Inferior em 4 dias (Upper A, Lower A, Upper B, Lower B).',
    days: [
      {
        day_of_week: 1,
        day_label: 'Segunda-feira',
        is_rest_day: false,
        session_name: 'Sessão A — Superior (Upper A - Foco Horizontal)',
        session_focus: 'upper_a',
        slots: [
          { slot_order: 1, pattern: 'push_horizontal', target_muscle: 'chest', prefer_compound: true },
          { slot_order: 2, pattern: 'pull_horizontal', target_muscle: 'back', prefer_compound: true },
          { slot_order: 3, pattern: 'push_vertical', target_muscle: 'shoulders', prefer_compound: true },
          { slot_order: 4, pattern: 'pull_vertical', target_muscle: 'back', prefer_compound: true },
          { slot_order: 5, pattern: 'isolation', target_muscle: 'triceps', prefer_compound: false },
          { slot_order: 6, pattern: 'isolation', target_muscle: 'biceps', prefer_compound: false },
        ],
      },
      {
        day_of_week: 2,
        day_label: 'Terça-feira',
        is_rest_day: false,
        session_name: 'Sessão B — Inferior (Lower A - Foco Quadríceps)',
        session_focus: 'lower_a',
        slots: [
          { slot_order: 1, pattern: 'squat', target_muscle: 'quadriceps', prefer_compound: true },
          { slot_order: 2, pattern: 'hinge', target_muscle: 'hamstrings', prefer_compound: true },
          { slot_order: 3, pattern: 'lunge', target_muscle: 'quadriceps', prefer_compound: true },
          { slot_order: 4, pattern: 'isolation', target_muscle: 'calves', prefer_compound: false },
          { slot_order: 5, pattern: 'core', target_muscle: 'core', prefer_compound: false },
        ],
      },
      { day_of_week: 3, day_label: 'Quarta-feira', is_rest_day: true },
      {
        day_of_week: 4,
        day_label: 'Quinta-feira',
        is_rest_day: false,
        session_name: 'Sessão C — Superior (Upper B - Foco Vertical)',
        session_focus: 'upper_b',
        slots: [
          { slot_order: 1, pattern: 'pull_vertical', target_muscle: 'back', prefer_compound: true },
          { slot_order: 2, pattern: 'push_vertical', target_muscle: 'shoulders', prefer_compound: true },
          { slot_order: 3, pattern: 'push_horizontal', target_muscle: 'chest', prefer_compound: true },
          { slot_order: 4, pattern: 'pull_horizontal', target_muscle: 'back', prefer_compound: true },
          { slot_order: 5, pattern: 'isolation', target_muscle: 'biceps', prefer_compound: false },
          { slot_order: 6, pattern: 'isolation', target_muscle: 'triceps', prefer_compound: false },
        ],
      },
      {
        day_of_week: 5,
        day_label: 'Sexta-feira',
        is_rest_day: false,
        session_name: 'Sessão D — Inferior (Lower B - Foco Cadeia Posterior)',
        session_focus: 'lower_b',
        slots: [
          { slot_order: 1, pattern: 'hinge', target_muscle: 'glutes', prefer_compound: true },
          { slot_order: 2, pattern: 'squat', target_muscle: 'quadriceps', prefer_compound: true },
          { slot_order: 3, pattern: 'hinge', target_muscle: 'hamstrings', prefer_compound: true },
          { slot_order: 4, pattern: 'isolation', target_muscle: 'calves', prefer_compound: false },
          { slot_order: 5, pattern: 'core', target_muscle: 'core', prefer_compound: false },
        ],
      },
      { day_of_week: 6, day_label: 'Sábado', is_rest_day: true },
      { day_of_week: 7, day_label: 'Domingo', is_rest_day: true },
    ],
  },

  // ==========================================================================
  // 5 SESSÕES POR SEMANA (Upper / Lower + Push / Pull / Legs - Seg a Sex)
  // ==========================================================================
  5: {
    split_type: 'push_pull_legs',
    sessions_per_week: 5,
    description: 'Divisão Híbrida em 5 dias (Upper, Lower, Push, Pull, Legs) de Segunda a Sexta.',
    days: [
      {
        day_of_week: 1,
        day_label: 'Segunda-feira',
        is_rest_day: false,
        session_name: 'Sessão A — Superior Geral (Upper)',
        session_focus: 'upper',
        slots: [
          { slot_order: 1, pattern: 'push_horizontal', target_muscle: 'chest', prefer_compound: true },
          { slot_order: 2, pattern: 'pull_horizontal', target_muscle: 'back', prefer_compound: true },
          { slot_order: 3, pattern: 'push_vertical', target_muscle: 'shoulders', prefer_compound: true },
          { slot_order: 4, pattern: 'pull_vertical', target_muscle: 'back', prefer_compound: true },
          { slot_order: 5, pattern: 'isolation', target_muscle: 'triceps', prefer_compound: false },
        ],
      },
      {
        day_of_week: 2,
        day_label: 'Terça-feira',
        is_rest_day: false,
        session_name: 'Sessão B — Inferior Geral (Lower)',
        session_focus: 'lower',
        slots: [
          { slot_order: 1, pattern: 'squat', target_muscle: 'quadriceps', prefer_compound: true },
          { slot_order: 2, pattern: 'hinge', target_muscle: 'hamstrings', prefer_compound: true },
          { slot_order: 3, pattern: 'lunge', target_muscle: 'quadriceps', prefer_compound: true },
          { slot_order: 4, pattern: 'isolation', target_muscle: 'calves', prefer_compound: false },
          { slot_order: 5, pattern: 'core', target_muscle: 'core', prefer_compound: false },
        ],
      },
      {
        day_of_week: 3,
        day_label: 'Quarta-feira',
        is_rest_day: false,
        session_name: 'Sessão C — Empurrar (Push)',
        session_focus: 'push',
        slots: [
          { slot_order: 1, pattern: 'push_horizontal', target_muscle: 'chest', prefer_compound: true },
          { slot_order: 2, pattern: 'push_vertical', target_muscle: 'shoulders', prefer_compound: true },
          { slot_order: 3, pattern: 'push_horizontal', target_muscle: 'chest', prefer_compound: false },
          { slot_order: 4, pattern: 'isolation', target_muscle: 'triceps', prefer_compound: false },
        ],
      },
      {
        day_of_week: 4,
        day_label: 'Quinta-feira',
        is_rest_day: false,
        session_name: 'Sessão D — Puxar (Pull)',
        session_focus: 'pull',
        slots: [
          { slot_order: 1, pattern: 'pull_vertical', target_muscle: 'back', prefer_compound: true },
          { slot_order: 2, pattern: 'pull_horizontal', target_muscle: 'back', prefer_compound: true },
          { slot_order: 3, pattern: 'isolation', target_muscle: 'shoulders', prefer_compound: false },
          { slot_order: 4, pattern: 'isolation', target_muscle: 'biceps', prefer_compound: false },
        ],
      },
      {
        day_of_week: 5,
        day_label: 'Sexta-feira',
        is_rest_day: false,
        session_name: 'Sessão E — Pernas (Legs)',
        session_focus: 'legs',
        slots: [
          { slot_order: 1, pattern: 'squat', target_muscle: 'quadriceps', prefer_compound: true },
          { slot_order: 2, pattern: 'hinge', target_muscle: 'glutes', prefer_compound: true },
          { slot_order: 3, pattern: 'isolation', target_muscle: 'hamstrings', prefer_compound: false },
          { slot_order: 4, pattern: 'isolation', target_muscle: 'calves', prefer_compound: false },
          { slot_order: 5, pattern: 'core', target_muscle: 'core', prefer_compound: false },
        ],
      },
      { day_of_week: 6, day_label: 'Sábado', is_rest_day: true },
      { day_of_week: 7, day_label: 'Domingo', is_rest_day: true },
    ],
  },

  // ==========================================================================
  // 6 SESSÕES POR SEMANA (Push / Pull / Legs x 2 - Seg a Sáb)
  // ==========================================================================
  6: {
    split_type: 'push_pull_legs',
    sessions_per_week: 6,
    description: 'Divisão Push / Pull / Legs (2 ciclos semanais completos) de Segunda a Sábado.',
    days: [
      {
        day_of_week: 1,
        day_label: 'Segunda-feira',
        is_rest_day: false,
        session_name: 'Sessão A — Empurrar 1 (Push A)',
        session_focus: 'push_a',
        slots: [
          { slot_order: 1, pattern: 'push_horizontal', target_muscle: 'chest', prefer_compound: true },
          { slot_order: 2, pattern: 'push_vertical', target_muscle: 'shoulders', prefer_compound: true },
          { slot_order: 3, pattern: 'push_horizontal', target_muscle: 'chest', prefer_compound: false },
          { slot_order: 4, pattern: 'isolation', target_muscle: 'triceps', prefer_compound: false },
        ],
      },
      {
        day_of_week: 2,
        day_label: 'Terça-feira',
        is_rest_day: false,
        session_name: 'Sessão B — Puxar 1 (Pull A)',
        session_focus: 'pull_a',
        slots: [
          { slot_order: 1, pattern: 'pull_vertical', target_muscle: 'back', prefer_compound: true },
          { slot_order: 2, pattern: 'pull_horizontal', target_muscle: 'back', prefer_compound: true },
          { slot_order: 3, pattern: 'isolation', target_muscle: 'shoulders', prefer_compound: false },
          { slot_order: 4, pattern: 'isolation', target_muscle: 'biceps', prefer_compound: false },
        ],
      },
      {
        day_of_week: 3,
        day_label: 'Quarta-feira',
        is_rest_day: false,
        session_name: 'Sessão C — Pernas 1 (Legs A - Foco Anterior)',
        session_focus: 'legs_a',
        slots: [
          { slot_order: 1, pattern: 'squat', target_muscle: 'quadriceps', prefer_compound: true },
          { slot_order: 2, pattern: 'lunge', target_muscle: 'quadriceps', prefer_compound: true },
          { slot_order: 3, pattern: 'hinge', target_muscle: 'hamstrings', prefer_compound: true },
          { slot_order: 4, pattern: 'isolation', target_muscle: 'calves', prefer_compound: false },
          { slot_order: 5, pattern: 'core', target_muscle: 'core', prefer_compound: false },
        ],
      },
      {
        day_of_week: 4,
        day_label: 'Quinta-feira',
        is_rest_day: false,
        session_name: 'Sessão D — Empurrar 2 (Push B)',
        session_focus: 'push_b',
        slots: [
          { slot_order: 1, pattern: 'push_horizontal', target_muscle: 'chest', prefer_compound: true },
          { slot_order: 2, pattern: 'push_vertical', target_muscle: 'shoulders', prefer_compound: true },
          { slot_order: 3, pattern: 'isolation', target_muscle: 'triceps', prefer_compound: false },
          { slot_order: 4, pattern: 'isolation', target_muscle: 'triceps', prefer_compound: false },
        ],
      },
      {
        day_of_week: 5,
        day_label: 'Sexta-feira',
        is_rest_day: false,
        session_name: 'Sessão E — Puxar 2 (Pull B)',
        session_focus: 'pull_b',
        slots: [
          { slot_order: 1, pattern: 'pull_horizontal', target_muscle: 'back', prefer_compound: true },
          { slot_order: 2, pattern: 'pull_vertical', target_muscle: 'back', prefer_compound: true },
          { slot_order: 3, pattern: 'isolation', target_muscle: 'biceps', prefer_compound: false },
          { slot_order: 4, pattern: 'isolation', target_muscle: 'biceps', prefer_compound: false },
        ],
      },
      {
        day_of_week: 6,
        day_label: 'Sábado',
        is_rest_day: false,
        session_name: 'Sessão F — Pernas 2 (Legs B - Foco Posterior e Glúteos)',
        session_focus: 'legs_b',
        slots: [
          { slot_order: 1, pattern: 'hinge', target_muscle: 'glutes', prefer_compound: true },
          { slot_order: 2, pattern: 'squat', target_muscle: 'quadriceps', prefer_compound: true },
          { slot_order: 3, pattern: 'isolation', target_muscle: 'hamstrings', prefer_compound: false },
          { slot_order: 4, pattern: 'isolation', target_muscle: 'calves', prefer_compound: false },
          { slot_order: 5, pattern: 'core', target_muscle: 'core', prefer_compound: false },
        ],
      },
      { day_of_week: 7, day_label: 'Domingo', is_rest_day: true },
    ],
  },
};

export function getSplitTemplate(sessionsPerWeek: number): SplitTemplate | null {
  return SPLIT_TEMPLATES[sessionsPerWeek] ?? null;
}
