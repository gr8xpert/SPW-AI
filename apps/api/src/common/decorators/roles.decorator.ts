import { SetMetadata } from '@nestjs/common';
import { UserRoleType } from '@spw/shared';
import { ROLES_KEY } from '../guards/roles.guard';

/**
 * Decorator to specify required roles for a route handler or controller.
 * Uses role hierarchy - a higher role includes permissions of lower roles.
 *
 * Example:
 * @Roles(UserRole.SUPER_ADMIN) - Only super admins
 * @Roles(UserRole.ADMIN) - Admins and super admins
 * @Roles(UserRole.WEBMASTER) - Webmasters, admins (not applicable), and super admins
 */
export const Roles = (...roles: UserRoleType[]) => SetMetadata(ROLES_KEY, roles);
