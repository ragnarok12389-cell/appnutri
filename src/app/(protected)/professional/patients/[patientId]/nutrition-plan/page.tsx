import React from 'react';
import Link from 'next/link';
import { requireRole } from '@/lib/auth/guards';
import { getLatestDietPlanAction } from '@/app/actions/diet-plan';
import { ProfessionalPlanClient } from './ProfessionalPlanClient';
import { ArrowLeft } from 'lucide-react';

interface Props {
  params: Promise<{ patientId: string }>;
}

export default async function ProfessionalNutritionPlanPage({ params }: Props) {
  const { patientId } = await params;
  await requireRole(['nutritionist', 'admin']);

  const result = await getLatestDietPlanAction(patientId);
  const plan = result.data || null;

  return (
    <div className="max-w-6xl mx-auto py-8 px-4 sm:px-6 space-y-6">
      <Link
        href={`/professional/patients/${patientId}`}
        className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> Voltar ao Prontuário do Paciente
      </Link>

      <ProfessionalPlanClient initialPlan={plan} patientId={patientId} />
    </div>
  );
}
