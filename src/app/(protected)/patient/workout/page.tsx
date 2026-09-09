import React from 'react';
import { requireRole } from '@/lib/auth/guards';
import { getActiveWorkoutProgramAction } from '@/app/actions/workout-program';
import { PatientWorkoutClient } from './PatientWorkoutClient';

export default async function PatientWorkoutPage() {
  const user = await requireRole('patient');
  const result = await getActiveWorkoutProgramAction(user.id);
  const program = result.data || null;

  return (
    <div className="max-w-5xl mx-auto py-8 px-4 sm:px-6">
      <PatientWorkoutClient initialProgram={program} patientId={user.id} />
    </div>
  );
}
