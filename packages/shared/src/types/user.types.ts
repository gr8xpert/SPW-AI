import { UserRoleType } from '../constants/roles';

export interface UserPublic {
  id: number;
  tenantId: number;
  email: string;
  name: string | null;
  role: UserRoleType;
  avatarUrl: string | null;
  twoFactorEnabled: boolean;
  isActive: boolean;
  lastLoginAt: Date | null;
}

export interface UserWithTenant extends UserPublic {
  tenant: {
    id: number;
    name: string;
    slug: string;
  };
}

export interface JwtPayload {
  sub: number; // user id
  email: string;
  tenantId: number;
  role: UserRoleType;
  iat?: number;
  exp?: number;

  // Impersonation claims. Present ONLY on tokens minted by
  // ImpersonationService — a super_admin acting as a client tenant. The
  // `sub` remains the SUPER_ADMIN's real user id (so audit + credit-hour
  // attribution stay honest), but role/tenantId reflect the impersonated
  // client so downstream guards behave as if the client were logged in.
  //
  // originalUserId — always the super_admin who initiated the swap
  // originalRole   — always 'super_admin'
  // impersonatedTenantId — the tenant being viewed
  // impersonatedUserId   — the client-side user the token is acting as
  //                        (typically the client's ADMIN user)
  impersonating?: boolean;
  originalUserId?: number;
  originalRole?: UserRoleType;
  impersonatedTenantId?: number;
  impersonatedUserId?: number;
}
