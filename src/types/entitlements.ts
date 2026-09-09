export interface ProductFeatureSnapshot {
  [featureKey: string]: Record<string, unknown>;
}

export interface UserEntitlement {
  id: string;
  patient_id: string;
  patient_name?: string;
  patient_email?: string;
  product_id: string;
  product_code: string;
  product_name: string;
  product_version: number;
  feature_snapshot: ProductFeatureSnapshot;
  status: 'active' | 'revoked' | 'expired';
  source: 'system' | 'admin' | 'promotion' | 'payment';
  valid_from: string;
  valid_until: string | null;
  created_at: string;
}

export interface ProductCatalogItem {
  id: string;
  code: string;
  name: string;
  description: string | null;
  product_version: number;
  commercial_status: 'active' | 'draft' | 'retired';
  features: string[];
}
