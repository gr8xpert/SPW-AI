import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User, Tenant, Plan } from '../../database/entities';
import { InviteUserDto, UpdateUserDto, ChangePasswordDto, ResetPasswordDto } from './dto';
import { UserRole, hasPermission } from '@spm/shared';

@Injectable()
export class TeamService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Tenant)
    private tenantRepository: Repository<Tenant>,
    @InjectRepository(Plan)
    private planRepository: Repository<Plan>,
  ) {}

  /**
   * Get all team members for a tenant
   */
  async getTeamMembers(tenantId: number): Promise<User[]> {
    return this.userRepository.find({
      where: { tenantId },
      select: ['id', 'email', 'name', 'role', 'permissions', 'avatarUrl', 'isActive', 'lastLoginAt', 'createdAt'],
      order: { role: 'DESC', name: 'ASC' },
    });
  }

  /**
   * Get a single team member
   */
  async getTeamMember(tenantId: number, userId: number): Promise<User> {
    const user = await this.userRepository.findOne({
      where: { id: userId, tenantId },
      select: ['id', 'email', 'name', 'role', 'permissions', 'avatarUrl', 'isActive', 'emailVerifiedAt', 'lastLoginAt', 'createdAt'],
    });

    if (!user) {
      throw new NotFoundException('Team member not found');
    }

    return user;
  }

  /**
   * Invite/create a new team member
   */
  async inviteUser(
    tenantId: number,
    dto: InviteUserDto,
    invitedByUserId: number,
  ): Promise<User> {
    // Check if user can invite with this role
    const inviter = await this.userRepository.findOne({
      where: { id: invitedByUserId, tenantId },
    });

    if (!inviter) {
      throw new ForbiddenException('Inviter not found');
    }

    // Only admins can invite users
    if (!hasPermission(inviter.role, UserRole.ADMIN)) {
      throw new ForbiddenException('Only admins can invite team members');
    }

    // Check if email already exists in this tenant
    const existingUser = await this.userRepository.findOne({
      where: { email: dto.email, tenantId },
    });

    if (existingUser) {
      throw new ConflictException('A user with this email already exists in your team');
    }

    // Check tenant user limit
    const tenant = await this.tenantRepository.findOne({
      where: { id: tenantId },
      relations: ['plan'],
    });

    if (tenant?.plan) {
      const currentUserCount = await this.userRepository.count({ where: { tenantId } });
      if (currentUserCount >= tenant.plan.maxUsers) {
        throw new BadRequestException(
          `User limit reached. Your plan allows up to ${tenant.plan.maxUsers} users.`,
        );
      }
    }

    // Hash password
    const passwordHash = await bcrypt.hash(dto.password, 13);

    const user = this.userRepository.create({
      tenantId,
      email: dto.email,
      name: dto.name,
      passwordHash,
      role: dto.role,
      isActive: true,
    });

    return this.userRepository.save(user);
  }

  /**
   * Update a team member
   */
  async updateUser(
    tenantId: number,
    userId: number,
    dto: UpdateUserDto,
    updatedByUserId: number,
  ): Promise<User> {
    const user = await this.userRepository.findOne({
      where: { id: userId, tenantId },
    });

    if (!user) {
      throw new NotFoundException('Team member not found');
    }

    // Cannot change super admin role
    if (user.role === UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Cannot modify super admin users');
    }

    // Only admins can update other users
    const updater = await this.userRepository.findOne({
      where: { id: updatedByUserId, tenantId },
    });

    if (!updater || !hasPermission(updater.role, UserRole.ADMIN)) {
      // Users can only update themselves
      if (userId !== updatedByUserId) {
        throw new ForbiddenException('You can only update your own profile');
      }
      // And they cannot change their own role
      if (dto.role !== undefined) {
        throw new ForbiddenException('You cannot change your own role');
      }
    }

    // Update fields
    if (dto.name !== undefined) user.name = dto.name;
    if (dto.role !== undefined) user.role = dto.role;
    if (dto.permissions !== undefined) user.permissions = dto.permissions;
    if (dto.isActive !== undefined) user.isActive = dto.isActive;

    return this.userRepository.save(user);
  }

  /**
   * Remove a team member
   */
  async removeUser(
    tenantId: number,
    userId: number,
    removedByUserId: number,
  ): Promise<void> {
    const user = await this.userRepository.findOne({
      where: { id: userId, tenantId },
    });

    if (!user) {
      throw new NotFoundException('Team member not found');
    }

    // Cannot remove super admins
    if (user.role === UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Cannot remove super admin users');
    }

    // Cannot remove yourself
    if (userId === removedByUserId) {
      throw new BadRequestException('You cannot remove yourself from the team');
    }

    // Only admins can remove users
    const remover = await this.userRepository.findOne({
      where: { id: removedByUserId, tenantId },
    });

    if (!remover || !hasPermission(remover.role, UserRole.ADMIN)) {
      throw new ForbiddenException('Only admins can remove team members');
    }

    // Ensure at least one admin remains
    if (user.role === UserRole.ADMIN) {
      const adminCount = await this.userRepository.count({
        where: { tenantId, role: UserRole.ADMIN },
      });

      if (adminCount <= 1) {
        throw new BadRequestException('Cannot remove the last admin. Promote another user first.');
      }
    }

    await this.userRepository.delete(userId);
  }

  /**
   * Change own password
   */
  async changePassword(
    tenantId: number,
    userId: number,
    dto: ChangePasswordDto,
  ): Promise<void> {
    const user = await this.userRepository.findOne({
      where: { id: userId, tenantId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Verify current password
    const isValid = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!isValid) {
      throw new BadRequestException('Current password is incorrect');
    }

    // Hash and save new password
    user.passwordHash = await bcrypt.hash(dto.newPassword, 13);
    await this.userRepository.save(user);
  }

  /**
   * Reset user password (admin function)
   */
  async resetUserPassword(
    tenantId: number,
    userId: number,
    dto: ResetPasswordDto,
    resetByUserId: number,
  ): Promise<void> {
    const user = await this.userRepository.findOne({
      where: { id: userId, tenantId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Only admins can reset other users' passwords
    const resetter = await this.userRepository.findOne({
      where: { id: resetByUserId, tenantId },
    });

    if (!resetter || !hasPermission(resetter.role, UserRole.ADMIN)) {
      throw new ForbiddenException('Only admins can reset user passwords');
    }

    // Cannot reset super admin password
    if (user.role === UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Cannot reset super admin password');
    }

    // Hash and save new password
    user.passwordHash = await bcrypt.hash(dto.newPassword, 13);
    await this.userRepository.save(user);
  }

  /**
   * Get team usage stats
   */
  async getTeamStats(tenantId: number): Promise<{
    currentUsers: number;
    maxUsers: number;
    admins: number;
    users: number;
  }> {
    const tenant = await this.tenantRepository.findOne({
      where: { id: tenantId },
      relations: ['plan'],
    });

    const users = await this.userRepository.find({
      where: { tenantId },
      select: ['role'],
    });

    const admins = users.filter((u) => u.role === UserRole.ADMIN).length;
    const regularUsers = users.filter((u) => u.role === UserRole.USER).length;

    return {
      currentUsers: users.length,
      maxUsers: tenant?.plan?.maxUsers || 5,
      admins,
      users: regularUsers,
    };
  }
}
