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
}
