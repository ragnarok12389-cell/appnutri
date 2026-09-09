import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/auth/guards';
import { getProgressDashboardAction } from '@/app/actions/progress';
import { ProfessionalProgressClient } from './ProfessionalProgressClient';

interface Props {
  params: Promise<{ patientId: string }>;
}

export default async function ProfessionalPatientProgressPage({ params }: Props) {
  const user = await requireRole(['nutritionist', 'influencer', 'admin']);
  const { patientId } = await params;
  const result = await getProgressDashboardAction(patientId);
  if (!result.success || !result.data) notFound();

  return <ProfessionalProgressClient patientId={patientId} role={user.profile.role_id} data={result.data} />;
}

