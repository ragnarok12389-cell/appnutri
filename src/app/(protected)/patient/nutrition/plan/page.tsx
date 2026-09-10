import React from 'react';
import { requireRole } from '@/lib/auth/guards';
import { getLatestDietPlanAction } from '@/app/actions/diet-plan';
import { PatientPlanClient } from './PatientPlanClient';

export default async function PatientNutritionPlanPage() {
  const user = await requireRole('patient');
  const result = await getLatestDietPlanAction(user.id);
  const plan = result.data || null;

  return (
    <div className="clinical-surface max-w-5xl w-full mx-auto py-6 sm:py-10 px-4 sm:px-6">
      <PatientPlanClient initialPlan={plan} patientId={user.id} />
    </div>
  );
}
