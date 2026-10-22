import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User, Tenant, Plan } from '../../database/entities';
import { ChangePasswordDto, ResetPasswordDto } from './dto';
import { AgentsService } from './agents.service';
import { agentCard } from './agent-profile';
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
    private readonly agents: AgentsService,
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
    if (user.role === UserRole.ADMIN && user.canLogin) {
      const adminCount = await this.userRepository.count({
        where: { tenantId, role: UserRole.ADMIN, canLogin: true },
      });

      if (adminCount <= 1) {
        throw new BadRequestException('Cannot remove the last admin. Promote another user first.');
      }
    }

    // The database deletes a user's buyer history (calls, notes, emails) and
    // support tickets with them: anyone who has some is switched off instead.
    const [[activity], [tickets]] = await Promise.all([
      this.userRepository.query('SELECT COUNT(*) AS n FROM lead_activities WHERE userId = ?', [userId]),
      this.userRepository.query('SELECT COUNT(*) AS n FROM tickets WHERE userId = ?', [userId]),
    ]);
    if (Number(activity?.n) > 0 || Number(tickets?.n) > 0) {
      throw new BadRequestException(
        'This agent has buyer history or support tickets, which removing would delete. Switch them to Inactive instead (Edit).',
      );
    }

    const wasOnWebsite = !!agentCard(user);
    await this.userRepository.delete(userId);
    if (wasOnWebsite) await this.agents.websiteChanged(tenantId, userId, null);
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

    // People without a login get one on the Agents page (email + password).
    if (!user.canLogin) {
      throw new BadRequestException('This agent has no dashboard login.');
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
      select: ['role', 'canLogin'],
    });

    // Only logins take a seat; people without a login are website faces.
    const logins = users.filter((u) => u.canLogin !== false);
    const admins = logins.filter((u) => u.role === UserRole.ADMIN).length;
    const regularUsers = logins.filter((u) => u.role === UserRole.USER).length;

    return {
      currentUsers: logins.length,
      maxUsers: tenant?.plan?.maxUsers || 5,
      admins,
      users: regularUsers,
    };
  }
}
