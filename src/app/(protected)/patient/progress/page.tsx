import { requireRole } from '@/lib/auth/guards';
import { getProgressDashboardAction } from '@/app/actions/progress';
import { PatientProgressClient } from './PatientProgressClient';

export default async function PatientProgressPage() {
  await requireRole('patient');
  const result = await getProgressDashboardAction();

  return (
    <PatientProgressClient
      initialData={result.data ?? { check_ins: [], latest_analysis: null, proposals: [] }}
      initialError={result.error}
    />
  );
}

