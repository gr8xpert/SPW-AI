export const UserRole = {
  SUPER_ADMIN: 'super_admin',
  WEBMASTER: 'webmaster',
  ADMIN: 'admin',
  USER: 'user',
} as const;

export type UserRoleType = (typeof UserRole)[keyof typeof UserRole];

export const ROLE_HIERARCHY: Record<UserRoleType, number> = {
  [UserRole.SUPER_ADMIN]: 100,
  [UserRole.WEBMASTER]: 75,
  [UserRole.ADMIN]: 50,
  [UserRole.USER]: 10,
};

export function hasPermission(
  userRole: UserRoleType,
  requiredRole: UserRoleType
): boolean {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole];
}
