import { redirect } from 'next/navigation';
import { requireAuth } from '@/lib/auth/guards';

export default async function DashboardPage() {
  const user = await requireAuth();

  if (user.profile.role_id === 'patient') redirect('/patient');
  if (user.profile.role_id === 'admin') redirect('/admin');
  redirect('/professional');
}
