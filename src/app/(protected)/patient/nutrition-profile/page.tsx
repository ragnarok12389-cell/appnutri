import React from 'react';
import { requireRole } from '@/lib/auth/guards';
import { getNutritionProfileForPatientAction } from '@/app/actions/nutrition-profile';
import NutritionProfileWizard from './NutritionProfileWizard';

export default async function PatientNutritionProfilePage() {
  const user = await requireRole(['patient', 'admin']);

  const res = await getNutritionProfileForPatientAction(user.id);
  const initialProfile = res.data || null;

  return (
    <div className="flex-1 w-full py-6">
      <NutritionProfileWizard initialProfile={initialProfile} />
    </div>
  );
}
