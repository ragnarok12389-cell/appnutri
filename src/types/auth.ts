import { Profile, Organization } from './database';
import { AppPermission } from './permissions';

export interface AuthUser {
  id: string;
  email: string;
  profile: Profile;
  permissions: AppPermission[];
  currentOrganization?: Organization | null;
}

export interface AuthSessionResponse {
  user: AuthUser | null;
  error?: string | null;
}
