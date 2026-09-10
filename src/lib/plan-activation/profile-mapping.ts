import { PatientNutritionProfile, PrimaryGoal } from '@/types/nutrition-profile';
import { EquipmentType, WorkoutExperienceLevel, WorkoutObjective } from '@/types/workout-engine';

export function mapPrimaryGoalToWorkoutObjective(goal: PrimaryGoal | null): WorkoutObjective {
  if (goal === 'gain_muscle' || goal === 'body_recomposition') return 'hypertrophy';
  if (goal === 'lose_weight') return 'weight_loss_support';
  if (goal === 'improve_performance') return 'conditioning_foundation';
  return 'general_fitness';
}

export function inferWorkoutExperience(
  profile: Pick<PatientNutritionProfile, 'training_days_per_week' | 'activity_level'>
): WorkoutExperienceLevel {
  if (
    (profile.training_days_per_week ?? 0) >= 4 &&
    ['high', 'very_high'].includes(profile.activity_level ?? '')
  ) {
    return 'intermediate';
  }
  return 'beginner';
}

export function inferWorkoutEquipment(
  profile: Pick<PatientNutritionProfile, 'available_workout_equipment'>
): EquipmentType[] {
  const equipment = profile.available_workout_equipment ?? [];
  return equipment.length > 0 ? [...new Set(equipment)] : ['bodyweight'];
}
