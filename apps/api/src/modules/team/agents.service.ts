import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Not, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { UserRole, hasPermission } from '@spm/shared';
import { Tenant, User } from '../../database/entities';
import { AgentDto } from './dto';
import { accessOf, agentCard, isPlaceholderEmail, placeholderEmail, planAccess, type AgentAccess } from './agent-profile';

const AGENT_FIELDS: (keyof User)[] = [
  'id', 'email', 'name', 'role', 'avatarUrl', 'title', 'phone', 'whatsapp', 'publicEmail',
  'showOnWebsite', 'worksBuyers', 'canLogin', 'isActive', 'lastLoginAt', 'createdAt',
];

// No password can ever match this (bcrypt hashes start with "$2").
const NO_PASSWORD = '!';

export interface AgentView {
  id: number;
  email: string | null;
  name: string | null;
  role: string;
  access: AgentAccess;
  avatarUrl: string | null;
  title: string | null;
  phone: string | null;
  whatsapp: string | null;
  publicEmail: string | null;
  showOnWebsite: boolean;
  worksBuyers: boolean;
  canLogin: boolean;
  isActive: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
}

const blank = (v: string | undefined): string | null | undefined => (v === undefined ? undefined : v.trim() || null);

// The Agents page (was Team): people for the website and for buyers. See
// docs/superpowers/specs/2026-10-22-agents-page-design.md.
@Injectable()
export class AgentsService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Tenant) private readonly tenants: Repository<Tenant>,
  ) {}

  static view(u: User): AgentView {
    return {
      id: u.id,
      email: isPlaceholderEmail(u.email) ? null : u.email,
      name: u.name,
      role: u.role,
      access: accessOf(u),
      avatarUrl: u.avatarUrl,
      title: u.title,
      phone: u.phone,
      whatsapp: u.whatsapp,
      publicEmail: u.publicEmail,
      showOnWebsite: !!u.showOnWebsite,
      worksBuyers: !!u.worksBuyers && u.canLogin !== false,
      canLogin: u.canLogin !== false,
      isActive: u.isActive,
      lastLoginAt: u.lastLoginAt,
      createdAt: u.createdAt,
    };
  }

  async list(tenantId: number): Promise<AgentView[]> {
    const rows = await this.users.find({
      where: { tenantId, role: In([UserRole.ADMIN, UserRole.USER]) },
      select: AGENT_FIELDS,
      order: { role: 'ASC', name: 'ASC' },
    });
    return rows.map(AgentsService.view);
  }

  // For pickers anywhere in the dashboard (property agent, Settings website
  // agent): active people, no add-on needed.
  async options(tenantId: number): Promise<AgentView[]> {
    return (await this.list(tenantId)).filter((a) => a.isActive);
  }

  async create(tenantId: number, dto: AgentDto, actorId: number): Promise<AgentView> {
    await this.requireManager(tenantId, actorId);
    const name = dto.name?.trim();
    if (!name) throw new BadRequestException('Give the agent a name.');
    const plan = planAccess({ access: dto.access ?? 'agent', worksBuyers: dto.worksBuyers ?? true, hadLogin: false });
    let email = placeholderEmail(tenantId);
    let passwordHash = NO_PASSWORD;
    if (plan.canLogin) {
      ({ email, passwordHash } = await this.newLogin(tenantId, dto));
    }
    const user = await this.users.save(
      this.users.create({
        tenantId,
        email,
        passwordHash,
        name,
        role: plan.role,
        canLogin: plan.canLogin,
        worksBuyers: plan.worksBuyers,
        buyerDigest: plan.canLogin,
        // A manager set the password: no verify link (none is ever sent),
        // otherwise the new login is refused until one is clicked.
        emailVerifiedAt: plan.canLogin ? new Date() : null,
        showOnWebsite: dto.showOnWebsite ?? false,
        title: blank(dto.title) ?? null,
        phone: blank(dto.phone) ?? null,
        whatsapp: blank(dto.whatsapp) ?? null,
        publicEmail: blank(dto.publicEmail) ?? null,
        avatarUrl: blank(dto.avatarUrl) ?? null,
        isActive: true,
      }),
    );
    if (user.showOnWebsite) await this.websiteChanged(tenantId, user.id, user);
    return AgentsService.view(user);
  }

  async update(tenantId: number, id: number, dto: AgentDto, actorId: number): Promise<AgentView> {
    const user = await this.users.findOne({ where: { id, tenantId } });
    if (!user) throw new NotFoundException('Agent not found');
    if (user.role === UserRole.SUPER_ADMIN || user.role === UserRole.WEBMASTER) throw new ForbiddenException('Cannot modify this user');
    const manager = await this.isManager(tenantId, actorId);
    const managed = ['access', 'worksBuyers', 'showOnWebsite', 'isActive', 'email', 'password'] as const;
    if (!manager) {
      if (id !== actorId) throw new ForbiddenException('Only managers can edit other agents');
      if (managed.some((k) => dto[k] !== undefined)) throw new ForbiddenException('Only managers can change access and switches');
    }
    const wasOnWebsite = !!agentCard(user);

    if (dto.name !== undefined) {
      const name = dto.name.trim();
      if (!name) throw new BadRequestException('Give the agent a name.');
      user.name = name;
    }
    for (const key of ['title', 'phone', 'whatsapp', 'publicEmail', 'avatarUrl'] as const) {
      const v = blank(dto[key]);
      if (v !== undefined) user[key] = v;
    }
    if (dto.showOnWebsite !== undefined) user.showOnWebsite = dto.showOnWebsite;
    if (dto.isActive !== undefined) {
      if (id === actorId && !dto.isActive) throw new BadRequestException('You cannot switch yourself off.');
      user.isActive = dto.isActive;
    }

    const access = dto.access ?? accessOf(user);
    if (access !== accessOf(user) || dto.worksBuyers !== undefined) {
      if (id === actorId && access !== accessOf(user)) throw new BadRequestException('You cannot change your own access.');
      const plan = planAccess({ access, worksBuyers: dto.worksBuyers ?? user.worksBuyers, hadLogin: user.canLogin });
      if (user.role === UserRole.ADMIN && user.canLogin && plan.role !== UserRole.ADMIN) await this.keepOneManager(tenantId, id);
      if (plan.needsLogin) {
        ({ email: user.email, passwordHash: user.passwordHash } = await this.newLogin(tenantId, dto, id));
        user.buyerDigest = true;
        user.emailVerifiedAt = new Date();
      } else if (!plan.canLogin && user.canLogin) {
        // No login any more: the login email is freed and no password works.
        user.email = placeholderEmail(tenantId);
        user.passwordHash = NO_PASSWORD;
      }
      user.role = plan.role;
      user.canLogin = plan.canLogin;
      user.worksBuyers = plan.worksBuyers;
    } else if (dto.email && user.canLogin && dto.email.trim().toLowerCase() !== user.email) {
      user.email = await this.freeEmail(tenantId, dto.email, id);
    }
    if (user.isActive === false && user.role === UserRole.ADMIN && user.canLogin) await this.keepOneManager(tenantId, id);

    const saved = await this.users.save(user);
    if (wasOnWebsite || agentCard(saved)) await this.websiteChanged(tenantId, saved.id, saved);
    return AgentsService.view(saved);
  }

  // After a person on the website changed or was removed: refresh the
  // Settings website agent when it is them, and tell the website caches.
  async websiteChanged(tenantId: number, userId: number, user: User | null): Promise<void> {
    const tenant = await this.tenants.findOne({ where: { id: tenantId }, select: ['id', 'settings'] });
    const settings = (tenant?.settings ?? {}) as unknown as Record<string, unknown>;
    const current = settings.siteAgent as { userId?: unknown } | undefined;
    if (tenant && current && Number(current.userId) === userId) {
      const card = agentCard(user);
      settings.siteAgent = card ? { ...card, userId } : {};
      await this.tenants.update({ id: tenantId }, { settings: settings as unknown as Tenant['settings'] });
    }
    await this.tenants.increment({ id: tenantId }, 'syncVersion', 1);
  }

  private async newLogin(tenantId: number, dto: AgentDto, exceptId?: number): Promise<{ email: string; passwordHash: string }> {
    if (!dto.email || !dto.password) throw new BadRequestException('A dashboard login needs an email and a password (8+ characters).');
    const email = await this.freeEmail(tenantId, dto.email, exceptId);
    await this.checkSeat(tenantId, exceptId);
    return { email, passwordHash: await bcrypt.hash(dto.password, 13) };
  }

  // Login looks people up by email across all agencies, so a login email must
  // be free everywhere (and in this agency for anyone).
  private async freeEmail(tenantId: number, raw: string, exceptId?: number): Promise<string> {
    const email = raw.trim().toLowerCase();
    const notMe = exceptId ? { id: Not(exceptId) } : {};
    const taken = await this.users.findOne({
      where: [
        { email, canLogin: true, ...notMe },
        { email, tenantId, ...notMe },
      ],
      select: ['id'],
    });
    if (taken) throw new ConflictException('This email already has a login.');
    return email;
  }

  // Only logins take a seat.
  private async checkSeat(tenantId: number, exceptId?: number): Promise<void> {
    const tenant = await this.tenants.findOne({ where: { id: tenantId }, relations: ['plan'] });
    if (!tenant?.plan) return;
    const used = await this.users.count({ where: { tenantId, canLogin: true, ...(exceptId ? { id: Not(exceptId) } : {}) } });
    if (used >= tenant.plan.maxUsers) {
      throw new BadRequestException(`User limit reached. Your plan allows up to ${tenant.plan.maxUsers} logins.`);
    }
  }

  private async keepOneManager(tenantId: number, exceptId: number): Promise<void> {
    const others = await this.users.count({
      where: { tenantId, role: UserRole.ADMIN, canLogin: true, isActive: true, id: Not(exceptId) },
    });
    if (!others) throw new BadRequestException('Keep at least one manager with a login.');
  }

  private async isManager(tenantId: number, actorId: number): Promise<boolean> {
    const actor = await this.users.findOne({ where: { id: actorId, tenantId }, select: ['id', 'role'] });
    return !!actor && hasPermission(actor.role, UserRole.ADMIN);
  }

  private async requireManager(tenantId: number, actorId: number): Promise<void> {
    if (!(await this.isManager(tenantId, actorId))) throw new ForbiddenException('Only managers can add agents');
  }
}
