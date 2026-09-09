import { requireRole } from '@/lib/auth/guards';
import { getAdminEntitlementsAction } from '@/app/actions/entitlements';
import { AdminProductsClient } from './AdminProductsClient';

export default async function AdminProductsPage() {
  await requireRole('admin');
  const result = await getAdminEntitlementsAction();
  return <AdminProductsClient data={result.data ?? { products: [], entitlements: [] }} initialError={result.error} />;
}
