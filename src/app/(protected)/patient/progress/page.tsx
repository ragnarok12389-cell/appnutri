import { requireRole } from '@/lib/auth/guards';
import { getProgressDashboardAction } from '@/app/actions/progress';
import { getPatientMediaAction } from '@/app/actions/patient-media';
import { PatientProgressClient } from './PatientProgressClient';

export default async function PatientProgressPage() {
  await requireRole('patient');
  const [result, media] = await Promise.all([
    getProgressDashboardAction(),
    getPatientMediaAction(),
  ]);

  return (
    <PatientProgressClient
      initialData={result.data ?? { check_ins: [], latest_analysis: null, proposals: [] }}
      initialError={result.error}
      initialProgressPhotos={media.progressPhotos}
      initialMealPhotos={media.mealPhotos}
    />
  );
}
