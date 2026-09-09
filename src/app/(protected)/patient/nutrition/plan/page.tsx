import React from 'react';
import { requireRole } from '@/lib/auth/guards';
import { getLatestDietPlanAction } from '@/app/actions/diet-plan';
import { PatientPlanClient } from './PatientPlanClient';

export default async function PatientNutritionPlanPage() {
  const user = await requireRole('patient');
  const result = await getLatestDietPlanAction(user.id);
  const plan = result.data || null;

  return (
    <div className="max-w-5xl mx-auto py-8 px-4 sm:px-6">
      <PatientPlanClient initialPlan={plan} patientId={user.id} />
    </div>
  );
}
