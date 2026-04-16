import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, Like, FindOptionsWhere } from 'typeorm';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import {
  Tenant,
  User,
  Plan,
  LicenseKey,
  CreditBalance,
  AuditLog,
} from '../../database/entities';
import { UserRole, DEFAULT_TENANT_SETTINGS, TenantFull } from '@spw/shared';
import { CreateClientDto, UpdateClientDto, QueryClientsDto, ExtendSubscriptionDto, ManualActivationDto, GenerateLicenseKeyDto, CreatePlanDto, UpdatePlanDto } from './dto';

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ClientListItem {
  id: number;
  name: string;
  slug: string;
  domain: string | null;
  ownerEmail: string | null;
  subscriptionStatus: string;
  expiresAt: Date | null;
  adminOverride: boolean;
  isInternal: boolean;
  isActive: boolean;
  planId: number;
  planName?: string;
  userCount?: number;
  propertyCount?: number;
  createdAt: Date;
}

@Injectable()
export class SuperAdminService {
  constructor(
    @InjectRepository(Tenant)
    private tenantRepository: Repository<Tenant>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Plan)
    private planRepository: Repository<Plan>,
    @InjectRepository(LicenseKey)
    private licenseKeyRepository: Repository<LicenseKey>,
    @InjectRepository(CreditBalance)
    private creditBalanceRepository: Repository<CreditBalance>,
    @InjectRepository(AuditLog)
    private auditLogRepository: Repository<AuditLog>,
    private dataSource: DataSource,
  ) {}

  /**
   * List all clients with pagination and filtering
   */
  async listClients(query: QueryClientsDto): Promise<PaginatedResult<ClientListItem>> {
    const {
      search,
      subscriptionStatus,
      isActive,
      isInternal,
      adminOverride,
      planId,
      page = 1,
      limit = 20,
      sortBy = 'createdAt',
      sortOrder = 'DESC',
    } = query;

    const where: FindOptionsWhere<Tenant> = {};

    if (search) {
      // Search in name, slug, domain, ownerEmail
      where.name = Like(`%${search}%`);
    }

    if (subscriptionStatus) {
      where.subscriptionStatus = subscriptionStatus;
    }

    if (isActive !== undefined) {
      where.isActive = isActive;
    }

    if (isInternal !== undefined) {
      where.isInternal = isInternal;
    }

    if (adminOverride !== undefined) {
      where.adminOverride = adminOverride;
    }

    if (planId) {
      where.planId = planId;
    }

    const [tenants, total] = await this.tenantRepository.findAndCount({
      where,
      relations: ['plan'],
      order: { [sortBy]: sortOrder },
      skip: (page - 1) * limit,
      take: limit,
    });

    // Get user counts for each tenant
    const tenantIds = tenants.map((t) => t.id);
    const userCounts = await this.userRepository
      .createQueryBuilder('user')
      .select('user.tenantId', 'tenantId')
      .addSelect('COUNT(*)', 'count')
      .where('user.tenantId IN (:...tenantIds)', { tenantIds: tenantIds.length > 0 ? tenantIds : [0] })
      .groupBy('user.tenantId')
      .getRawMany();

    const userCountMap = new Map(
      userCounts.map((uc) => [uc.tenantId, parseInt(uc.count)]),
    );

    const data: ClientListItem[] = tenants.map((tenant) => ({
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      domain: tenant.domain,
      ownerEmail: tenant.ownerEmail,
      subscriptionStatus: tenant.subscriptionStatus,
      expiresAt: tenant.expiresAt,
      adminOverride: tenant.adminOverride,
      isInternal: tenant.isInternal,
      isActive: tenant.isActive,
      planId: tenant.planId,
      planName: tenant.plan?.name,
      userCount: userCountMap.get(tenant.id) || 0,
      createdAt: tenant.createdAt,
    }));

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Get a single client with full details
   */
  async getClient(clientId: number): Promise<TenantFull & { adminUser?: any }> {
    const tenant = await this.tenantRepository.findOne({
      where: { id: clientId },
      relations: ['plan'],
    });

    if (!tenant) {
      throw new NotFoundException('Client not found');
    }

    // Get the admin user
    const adminUser = await this.userRepository.findOne({
      where: { tenantId: clientId, role: UserRole.ADMIN },
      select: ['id', 'email', 'name', 'lastLoginAt', 'isActive'],
    });

    return {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      domain: tenant.domain,
      ownerEmail: tenant.ownerEmail,
      siteName: tenant.siteName,
      apiUrl: tenant.apiUrl,
      apiKey: tenant.apiKey,
      webhookUrl: tenant.webhookUrl,
      settings: tenant.settings,
      isActive: tenant.isActive,
      subscriptionStatus: tenant.subscriptionStatus,
      billingCycle: tenant.billingCycle,
      billingSource: tenant.billingSource,
      expiresAt: tenant.expiresAt,
      graceEndsAt: tenant.graceEndsAt,
      adminOverride: tenant.adminOverride,
      isInternal: tenant.isInternal,
      widgetEnabled: tenant.widgetEnabled,
      aiSearchEnabled: tenant.aiSearchEnabled,
      widgetFeatures: tenant.widgetFeatures,
      planId: tenant.planId,
      adminUser,
    };
  }

  /**
   * Create a new client (tenant) with admin user
   */
  async createClient(dto: CreateClientDto, createdByUserId: number): Promise<TenantFull> {
    // Check if slug already exists
    const existingTenant = await this.tenantRepository.findOne({
      where: { slug: dto.slug },
    });

    if (existingTenant) {
      throw new ConflictException('A client with this slug already exists');
    }

    // Verify plan exists
    const plan = await this.planRepository.findOne({
      where: { id: dto.planId },
    });

    if (!plan) {
      throw new NotFoundException('Plan not found');
    }

    // Generate API key and webhook secret
    const apiKey = crypto.randomBytes(32).toString('hex');
    const webhookSecret = crypto.randomBytes(32).toString('hex');

    // Hash admin password
    const passwordHash = await bcrypt.hash(dto.adminPassword, 12);

    // Calculate grace period end date if expires is set
    let graceEndsAt: Date | null = null;
    if (dto.expiresAt) {
      graceEndsAt = new Date(dto.expiresAt);
      graceEndsAt.setDate(graceEndsAt.getDate() + 7);
    }

    // Use transaction to create tenant and admin user atomically
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Create tenant
      const tenant = this.tenantRepository.create({
        name: dto.name,
        slug: dto.slug,
        domain: dto.domain || null,
        ownerEmail: dto.ownerEmail || dto.adminEmail,
        siteName: dto.siteName || dto.name,
        apiUrl: dto.apiUrl || null,
        planId: dto.planId,
        apiKey,
        webhookSecret,
        settings: { ...DEFAULT_TENANT_SETTINGS, ...dto.settings },
        subscriptionStatus: dto.subscriptionStatus || 'active',
        billingCycle: dto.billingCycle || null,
        billingSource: dto.billingSource || 'manual',
        expiresAt: dto.expiresAt || null,
        graceEndsAt,
        adminOverride: dto.adminOverride || false,
        isInternal: dto.isInternal || false,
        widgetEnabled: dto.widgetEnabled !== false,
        aiSearchEnabled: dto.aiSearchEnabled || false,
        widgetFeatures: dto.widgetFeatures || ['search', 'detail', 'wishlist'],
      });

      const savedTenant = await queryRunner.manager.save(tenant);

      // Create admin user
      const adminUser = this.userRepository.create({
        tenantId: savedTenant.id,
        email: dto.adminEmail,
        passwordHash,
        name: dto.adminName || dto.name,
        role: UserRole.ADMIN,
        isActive: true,
      });

      await queryRunner.manager.save(adminUser);

      // Create initial credit balance
      const creditBalance = this.creditBalanceRepository.create({
        tenantId: savedTenant.id,
        balance: 0,
      });

      await queryRunner.manager.save(creditBalance);

      // Generate initial license key
      const licenseKey = this.licenseKeyRepository.create({
        tenantId: savedTenant.id,
        key: LicenseKey.generateKey(),
        status: 'active',
        domain: dto.domain || null,
      });

      await queryRunner.manager.save(licenseKey);

      // Log audit
      const auditLog = this.auditLogRepository.create({
        tenantId: savedTenant.id,
        userId: createdByUserId,
        action: 'create',
        entityType: 'tenant',
        entityId: savedTenant.id,
        metadata: { clientName: dto.name, adminEmail: dto.adminEmail },
      });

      await queryRunner.manager.save(auditLog);

      await queryRunner.commitTransaction();

      return this.getClient(savedTenant.id);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Update a client
   */
  async updateClient(
    clientId: number,
    dto: UpdateClientDto,
    updatedByUserId: number,
  ): Promise<TenantFull> {
    const tenant = await this.tenantRepository.findOne({
      where: { id: clientId },
    });

    if (!tenant) {
      throw new NotFoundException('Client not found');
    }

    // If plan is being changed, verify it exists
    if (dto.planId && dto.planId !== tenant.planId) {
      const plan = await this.planRepository.findOne({
        where: { id: dto.planId },
      });

      if (!plan) {
        throw new NotFoundException('Plan not found');
      }
    }

    // Track changes for audit log
    const changes: Record<string, { before: any; after: any }> = {};

    // Update fields
    const updateFields = [
      'name', 'domain', 'ownerEmail', 'siteName', 'apiUrl', 'planId',
      'subscriptionStatus', 'billingCycle', 'billingSource',
      'expiresAt', 'graceEndsAt', 'adminOverride', 'isInternal',
      'widgetEnabled', 'aiSearchEnabled', 'widgetFeatures', 'isActive',
    ];

    for (const field of updateFields) {
      const dtoValue = (dto as any)[field];
      const tenantValue = (tenant as any)[field];
      if (dtoValue !== undefined && dtoValue !== tenantValue) {
        changes[field] = { before: tenantValue, after: dtoValue };
        (tenant as any)[field] = dtoValue;
      }
    }

    // Merge settings
    if (dto.settings) {
      changes.settings = { before: tenant.settings, after: { ...tenant.settings, ...dto.settings } };
      tenant.settings = { ...tenant.settings, ...dto.settings };
    }

    // Auto-calculate grace period if expiresAt changed
    if (dto.expiresAt !== undefined && dto.graceEndsAt === undefined) {
      if (dto.expiresAt) {
        tenant.graceEndsAt = new Date(dto.expiresAt);
        tenant.graceEndsAt.setDate(tenant.graceEndsAt.getDate() + 7);
      } else {
        tenant.graceEndsAt = null;
      }
    }

    await this.tenantRepository.save(tenant);

    // Log audit
    if (Object.keys(changes).length > 0) {
      const auditLog = this.auditLogRepository.create({
        tenantId: clientId,
        userId: updatedByUserId,
        action: 'update',
        entityType: 'tenant',
        entityId: clientId,
        changes,
      });

      await this.auditLogRepository.save(auditLog);
    }

    return this.getClient(clientId);
  }

  /**
   * Deactivate a client. Intentionally a soft delete — hard-deleting a tenant
   * cascades across properties, leads, media, etc. and is unrecoverable. If a
   * true purge is ever needed, do it deliberately via a DB-side script and
   * document the procedure.
   */
  async deleteClient(clientId: number, deletedByUserId: number): Promise<void> {
    const tenant = await this.tenantRepository.findOne({
      where: { id: clientId },
    });

    if (!tenant) {
      throw new NotFoundException('Client not found');
    }

    if (!tenant.isActive) {
      throw new BadRequestException('Client is already deactivated');
    }

    tenant.isActive = false;
    tenant.subscriptionStatus = 'expired';
    await this.tenantRepository.save(tenant);

    const auditLog = this.auditLogRepository.create({
      tenantId: clientId,
      userId: deletedByUserId,
      action: 'delete',
      entityType: 'tenant',
      entityId: clientId,
      metadata: { clientName: tenant.name, clientSlug: tenant.slug, type: 'soft' },
    });

    await this.auditLogRepository.save(auditLog);
  }

  /**
   * Toggle admin override
   */
  async toggleAdminOverride(clientId: number, userId: number): Promise<TenantFull> {
    const tenant = await this.tenantRepository.findOne({
      where: { id: clientId },
    });

    if (!tenant) {
      throw new NotFoundException('Client not found');
    }

    tenant.adminOverride = !tenant.adminOverride;
    await this.tenantRepository.save(tenant);

    // Log audit
    const auditLog = this.auditLogRepository.create({
      tenantId: clientId,
      userId,
      action: 'update',
      entityType: 'tenant',
      entityId: clientId,
      changes: { adminOverride: { before: !tenant.adminOverride, after: tenant.adminOverride } },
    });

    await this.auditLogRepository.save(auditLog);

    return this.getClient(clientId);
  }

  /**
   * Manually activate subscription
   */
  async manualActivation(
    clientId: number,
    dto: ManualActivationDto,
    userId: number,
  ): Promise<TenantFull> {
    const tenant = await this.tenantRepository.findOne({
      where: { id: clientId },
    });

    if (!tenant) {
      throw new NotFoundException('Client not found');
    }

    const durationDays = dto.durationDays || (dto.billingCycle === 'yearly' ? 365 : 30);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + durationDays);

    const graceEndsAt = new Date(expiresAt);
    graceEndsAt.setDate(graceEndsAt.getDate() + 7);

    tenant.subscriptionStatus = 'manual';
    tenant.billingCycle = dto.billingCycle;
    tenant.billingSource = 'manual';
    tenant.expiresAt = expiresAt;
    tenant.graceEndsAt = graceEndsAt;
    tenant.widgetEnabled = true;

    await this.tenantRepository.save(tenant);

    // Log audit
    const auditLog = this.auditLogRepository.create({
      tenantId: clientId,
      userId,
      action: 'update',
      entityType: 'tenant',
      entityId: clientId,
      metadata: { action: 'manual_activation', durationDays, billingCycle: dto.billingCycle },
    });

    await this.auditLogRepository.save(auditLog);

    return this.getClient(clientId);
  }

  /**
   * Extend subscription by X days
   */
  async extendSubscription(
    clientId: number,
    dto: ExtendSubscriptionDto,
    userId: number,
  ): Promise<TenantFull> {
    const tenant = await this.tenantRepository.findOne({
      where: { id: clientId },
    });

    if (!tenant) {
      throw new NotFoundException('Client not found');
    }

    if (dto.days <= 0) {
      throw new BadRequestException('Days must be positive');
    }

    // Extend from current expiry or from now
    const baseDate = tenant.expiresAt && tenant.expiresAt > new Date()
      ? new Date(tenant.expiresAt)
      : new Date();

    const expiresAt = new Date(baseDate);
    expiresAt.setDate(expiresAt.getDate() + dto.days);

    const graceEndsAt = new Date(expiresAt);
    graceEndsAt.setDate(graceEndsAt.getDate() + 7);

    tenant.expiresAt = expiresAt;
    tenant.graceEndsAt = graceEndsAt;

    // Reactivate if expired
    if (tenant.subscriptionStatus === 'expired' || tenant.subscriptionStatus === 'grace') {
      tenant.subscriptionStatus = tenant.billingSource === 'manual' ? 'manual' : 'active';
    }

    await this.tenantRepository.save(tenant);

    // Log audit
    const auditLog = this.auditLogRepository.create({
      tenantId: clientId,
      userId,
      action: 'update',
      entityType: 'tenant',
      entityId: clientId,
      metadata: { action: 'extend_subscription', days: dto.days },
    });

    await this.auditLogRepository.save(auditLog);

    return this.getClient(clientId);
  }

  /**
   * Check CRM connection status for a client
   */
  async checkConnection(clientId: number): Promise<{ dashboard: boolean; crmApi: boolean; widget: boolean }> {
    const tenant = await this.tenantRepository.findOne({
      where: { id: clientId },
    });

    if (!tenant) {
      throw new NotFoundException('Client not found');
    }

    // Check if dashboard is configured (has logged in recently)
    const recentLogin = await this.userRepository.findOne({
      where: { tenantId: clientId },
      order: { lastLoginAt: 'DESC' },
    });

    const dashboardConfigured = !!recentLogin?.lastLoginAt;

    // Check if widget is enabled
    const widgetConfigured = tenant.widgetEnabled && tenant.widgetFeatures.length > 0;

    // CRM API connection would need to be tested against external API
    // For now, check if API credentials exist in settings
    const crmApiConfigured = !!(tenant.settings as any).crmApiKey;

    return {
      dashboard: dashboardConfigured,
      crmApi: crmApiConfigured,
      widget: widgetConfigured,
    };
  }

  /**
   * Get dashboard stats for super admin
   */
  async getDashboardStats(): Promise<{
    totalClients: number;
    activeClients: number;
    expiringClients: number;
    expiredClients: number;
    recentClients: any[];
    subscriptionsByStatus: Record<string, number>;
  }> {
    const totalClients = await this.tenantRepository.count();
    const activeClients = await this.tenantRepository.count({
      where: { isActive: true },
    });

    // Clients expiring in next 7 days
    const sevenDaysFromNow = new Date();
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

    const expiringClients = await this.tenantRepository
      .createQueryBuilder('tenant')
      .where('tenant.expiresAt BETWEEN NOW() AND :sevenDays', { sevenDays: sevenDaysFromNow })
      .andWhere('tenant.adminOverride = false')
      .andWhere('tenant.isInternal = false')
      .getCount();

    const expiredClients = await this.tenantRepository.count({
      where: { subscriptionStatus: 'expired' },
    });

    // Recent clients (last 5)
    const recentClients = await this.tenantRepository.find({
      order: { createdAt: 'DESC' },
      take: 5,
      select: ['id', 'name', 'slug', 'subscriptionStatus', 'createdAt'],
    });

    // Subscriptions by status
    const statusCounts = await this.tenantRepository
      .createQueryBuilder('tenant')
      .select('tenant.subscriptionStatus', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('tenant.subscriptionStatus')
      .getRawMany();

    const subscriptionsByStatus: Record<string, number> = {};
    for (const row of statusCounts) {
      subscriptionsByStatus[row.status] = parseInt(row.count);
    }

    return {
      totalClients,
      activeClients,
      expiringClients,
      expiredClients,
      recentClients,
      subscriptionsByStatus,
    };
  }

  // ============ LICENSE KEY MANAGEMENT ============

  /**
   * Get all license keys for a client
   */
  async getLicenseKeys(clientId: number): Promise<LicenseKey[]> {
    const tenant = await this.tenantRepository.findOne({
      where: { id: clientId },
    });

    if (!tenant) {
      throw new NotFoundException('Client not found');
    }

    return this.licenseKeyRepository.find({
      where: { tenantId: clientId },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Generate a new license key for a client
   */
  async generateLicenseKey(
    clientId: number,
    dto: GenerateLicenseKeyDto,
    userId: number,
  ): Promise<LicenseKey> {
    const tenant = await this.tenantRepository.findOne({
      where: { id: clientId },
    });

    if (!tenant) {
      throw new NotFoundException('Client not found');
    }

    const licenseKey = this.licenseKeyRepository.create({
      tenantId: clientId,
      key: LicenseKey.generateKey(),
      status: 'active',
      domain: dto.domain || null,
    });

    const saved = await this.licenseKeyRepository.save(licenseKey);

    // Log audit
    const auditLog = this.auditLogRepository.create({
      tenantId: clientId,
      userId,
      action: 'create',
      entityType: 'license_key',
      entityId: saved.id,
      // Do not log the key value itself — audit logs should not hold secrets.
      metadata: { domain: dto.domain, keyPrefix: saved.key.slice(0, 8) },
    });

    await this.auditLogRepository.save(auditLog);

    return saved;
  }

  /**
   * Revoke a license key
   */
  async revokeLicenseKey(
    clientId: number,
    keyId: number,
    userId: number,
  ): Promise<LicenseKey> {
    const licenseKey = await this.licenseKeyRepository.findOne({
      where: { id: keyId, tenantId: clientId },
    });

    if (!licenseKey) {
      throw new NotFoundException('License key not found');
    }

    if (licenseKey.status === 'revoked') {
      throw new BadRequestException('License key is already revoked');
    }

    licenseKey.status = 'revoked';
    licenseKey.revokedAt = new Date();

    const saved = await this.licenseKeyRepository.save(licenseKey);

    // Log audit
    const auditLog = this.auditLogRepository.create({
      tenantId: clientId,
      userId,
      action: 'update',
      entityType: 'license_key',
      entityId: keyId,
      changes: { status: { before: 'active', after: 'revoked' } },
    });

    await this.auditLogRepository.save(auditLog);

    return saved;
  }

  /**
   * Regenerate a license key (revoke old, create new)
   */
  async regenerateLicenseKey(
    clientId: number,
    keyId: number,
    userId: number,
  ): Promise<LicenseKey> {
    const oldKey = await this.licenseKeyRepository.findOne({
      where: { id: keyId, tenantId: clientId },
    });

    if (!oldKey) {
      throw new NotFoundException('License key not found');
    }

    // Revoke the old key
    oldKey.status = 'revoked';
    oldKey.revokedAt = new Date();
    await this.licenseKeyRepository.save(oldKey);

    // Create new key with same domain
    const newKey = this.licenseKeyRepository.create({
      tenantId: clientId,
      key: LicenseKey.generateKey(),
      status: 'active',
      domain: oldKey.domain,
    });

    const saved = await this.licenseKeyRepository.save(newKey);

    // Log audit
    const auditLog = this.auditLogRepository.create({
      tenantId: clientId,
      userId,
      action: 'update',
      entityType: 'license_key',
      entityId: keyId,
      metadata: {
        action: 'regenerate',
        oldKeyPrefix: oldKey.key.slice(0, 8),
        newKeyPrefix: saved.key.slice(0, 8),
      },
    });

    await this.auditLogRepository.save(auditLog);

    return saved;
  }

  // ============ PLAN MANAGEMENT ============

  /**
   * Get all plans
   */
  async getPlans(): Promise<Plan[]> {
    return this.planRepository.find({
      order: { priceMonthly: 'ASC' },
    });
  }

  /**
   * Get a single plan by ID
   */
  async getPlan(planId: number): Promise<Plan> {
    const plan = await this.planRepository.findOne({
      where: { id: planId },
    });

    if (!plan) {
      throw new NotFoundException('Plan not found');
    }

    return plan;
  }

  /**
   * Create a new plan
   */
  async createPlan(dto: CreatePlanDto, userId: number): Promise<Plan> {
    // Check if slug already exists
    const existing = await this.planRepository.findOne({
      where: { slug: dto.slug },
    });

    if (existing) {
      throw new ConflictException('A plan with this slug already exists');
    }

    const plan = this.planRepository.create({
      name: dto.name,
      slug: dto.slug,
      priceMonthly: dto.priceMonthly ?? null,
      priceYearly: dto.priceYearly ?? null,
      maxProperties: dto.maxProperties,
      maxUsers: dto.maxUsers,
      features: dto.features ?? {
        feeds: false,
        campaigns: false,
        analytics: false,
        apiAccess: false,
        customBranding: false,
      },
      isActive: dto.isActive !== false,
    });

    const saved = await this.planRepository.save(plan);

    // Log audit
    const auditLog = this.auditLogRepository.create({
      tenantId: null,
      userId,
      action: 'create',
      entityType: 'plan',
      entityId: saved.id,
      metadata: { planName: dto.name, planSlug: dto.slug },
    });

    await this.auditLogRepository.save(auditLog);

    return saved;
  }

  /**
   * Update a plan
   */
  async updatePlan(planId: number, dto: UpdatePlanDto, userId: number): Promise<Plan> {
    const plan = await this.planRepository.findOne({
      where: { id: planId },
    });

    if (!plan) {
      throw new NotFoundException('Plan not found');
    }

    // Track changes for audit
    const changes: Record<string, { before: any; after: any }> = {};

    const updateFields = ['name', 'priceMonthly', 'priceYearly', 'maxProperties', 'maxUsers', 'isActive'];

    for (const field of updateFields) {
      const dtoValue = (dto as any)[field];
      const planValue = (plan as any)[field];
      if (dtoValue !== undefined && dtoValue !== planValue) {
        changes[field] = { before: planValue, after: dtoValue };
        (plan as any)[field] = dtoValue;
      }
    }

    if (dto.features) {
      changes.features = { before: plan.features, after: dto.features };
      plan.features = dto.features;
    }

    const saved = await this.planRepository.save(plan);

    // Log audit
    if (Object.keys(changes).length > 0) {
      const auditLog = this.auditLogRepository.create({
        tenantId: null,
        userId,
        action: 'update',
        entityType: 'plan',
        entityId: planId,
        changes,
      });

      await this.auditLogRepository.save(auditLog);
    }

    return saved;
  }

  /**
   * Delete a plan (only if no tenants are using it)
   */
  async deletePlan(planId: number, userId: number): Promise<void> {
    const plan = await this.planRepository.findOne({
      where: { id: planId },
    });

    if (!plan) {
      throw new NotFoundException('Plan not found');
    }

    // Check if any tenants are using this plan
    const tenantCount = await this.tenantRepository.count({
      where: { planId },
    });

    if (tenantCount > 0) {
      throw new BadRequestException(
        `Cannot delete plan: ${tenantCount} client(s) are currently using this plan`,
      );
    }

    // Log audit before deletion
    const auditLog = this.auditLogRepository.create({
      tenantId: null,
      userId,
      action: 'delete',
      entityType: 'plan',
      entityId: planId,
      metadata: { planName: plan.name, planSlug: plan.slug },
    });

    await this.auditLogRepository.save(auditLog);

    await this.planRepository.delete(planId);
  }

  /**
   * Get plan usage statistics
   */
  async getPlanStats(): Promise<Array<{ planId: number; planName: string; tenantCount: number }>> {
    const stats = await this.tenantRepository
      .createQueryBuilder('tenant')
      .select('tenant.planId', 'planId')
      .addSelect('COUNT(*)', 'tenantCount')
      .groupBy('tenant.planId')
      .getRawMany();

    const plans = await this.planRepository.find();
    const planMap = new Map(plans.map((p) => [p.id, p.name]));

    return stats.map((s) => ({
      planId: s.planId,
      planName: planMap.get(s.planId) || 'Unknown',
      tenantCount: parseInt(s.tenantCount),
    }));
  }
}
