import {
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { randomBytes } from 'crypto';
import {
  Tenant,
  User,
  Plan,
  CreditBalance,
  CreditTransaction,
  LicenseKey,
  AuditLog,
} from '../../database/entities';
import {
  UserRole,
  DEFAULT_TENANT_SETTINGS,
  DEFAULT_FEATURE_FLAGS,
  TenantTier,
} from '@spm/shared';
import { generateApiKey } from '../../common/crypto/api-key';
import { TierPolicyService } from '../tenant/tier-policy.service';

// Rows the operator can put in the CSV. Only `name`, `slug`, `adminEmail`
// are required; the rest have safe defaults. `tier` defaults to 1 so an
// operator dropping in a raw client list can't accidentally hand out premium
// features. `existingCreditHours` seeds the credit balance for tenants that
// were mid-service on the old platform.
export interface ClientImportRow {
  name?: string;
  slug?: string;
  adminEmail?: string;
  adminName?: string;
  adminPassword?: string;   // when blank, we generate a random one and log it in the audit metadata
  domain?: string;
  siteName?: string;
  tier?: string;            // '1' | '2' | '3'
  planId?: string;
  existingCreditHours?: string;
  xeroContactId?: string;
}

export type ImportRowStatus =
  | 'ok'
  | 'duplicate_slug'
  | 'duplicate_email'
  | 'invalid_email'
  | 'invalid_tier'
  | 'missing_required'
  | 'plan_not_found'
  | 'unknown_error';

export interface ImportRowResult {
  index: number;
  status: ImportRowStatus;
  message?: string;
  tenantId?: number;
  generatedPassword?: string; // Only populated when we minted one for a row
}

export interface ImportPreviewResult {
  headers: string[];
  rows: Array<{ index: number; row: ClientImportRow; status: ImportRowStatus; message?: string }>;
  totals: {
    total: number;
    ok: number;
    skipped: number;
  };
}

export interface ImportExecuteResult {
  results: ImportRowResult[];
  totals: {
    total: number;
    created: number;
    skipped: number;
    failed: number;
  };
}

@Injectable()
export class ClientImportService {
  private readonly logger = new Logger(ClientImportService.name);

  constructor(
    @InjectRepository(Tenant)
    private readonly tenantRepository: Repository<Tenant>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Plan)
    private readonly planRepository: Repository<Plan>,
    @InjectRepository(CreditBalance)
    private readonly creditBalanceRepository: Repository<CreditBalance>,
    @InjectRepository(CreditTransaction)
    private readonly creditTransactionRepository: Repository<CreditTransaction>,
    @InjectRepository(LicenseKey)
    private readonly licenseKeyRepository: Repository<LicenseKey>,
    @InjectRepository(AuditLog)
    private readonly auditLogRepository: Repository<AuditLog>,
    private readonly dataSource: DataSource,
    private readonly tierPolicy: TierPolicyService,
  ) {}

  // Dry-run mode: parse + validate the CSV and return per-row status
  // without touching the database. Operator eyeballs the preview table
  // before hitting Execute.
  async preview(csv: string): Promise<ImportPreviewResult> {
    const { headers, rows } = this.parseCsv(csv);
    if (rows.length === 0) {
      throw new BadRequestException('CSV contained no data rows');
    }
    if (rows.length > 2000) {
      // Guardrail against accidentally uploading a giant file that would
      // block the request; 840 clients + headroom stays well under.
      throw new BadRequestException(
        `CSV has ${rows.length} rows. Maximum 2000 per batch.`,
      );
    }

    const results = await Promise.all(
      rows.map(async (row, i) => {
        const validation = await this.validateRow(row);
        return { index: i, row, ...validation };
      }),
    );

    return {
      headers,
      rows: results,
      totals: {
        total: rows.length,
        ok: results.filter((r) => r.status === 'ok').length,
        skipped: results.filter((r) => r.status !== 'ok').length,
      },
    };
  }

  // Executes the import. Each row runs in its own transaction so a bad row
  // doesn't rollback the batch — the operator can fix bad rows and re-run
  // with the same file thanks to idempotent slug/email checks.
  async execute(
    csv: string,
    createdByUserId: number,
  ): Promise<ImportExecuteResult> {
    const { rows } = this.parseCsv(csv);
    if (rows.length === 0) {
      throw new BadRequestException('CSV contained no data rows');
    }
    if (rows.length > 2000) {
      throw new BadRequestException(
        `CSV has ${rows.length} rows. Maximum 2000 per batch.`,
      );
    }

    const results: ImportRowResult[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const validation = await this.validateRow(row);
      if (validation.status !== 'ok') {
        results.push({ index: i, status: validation.status, message: validation.message });
        continue;
      }
      try {
        const created = await this.createOneFromRow(row, createdByUserId);
        results.push({
          index: i,
          status: 'ok',
          tenantId: created.tenantId,
          generatedPassword: created.generatedPassword,
        });
      } catch (err) {
        this.logger.warn(
          `CSV import row ${i} failed: ${(err as Error).message}`,
        );
        results.push({
          index: i,
          status: 'unknown_error',
          message: (err as Error).message,
        });
      }
    }

    return {
      results,
      totals: {
        total: rows.length,
        created: results.filter((r) => r.status === 'ok').length,
        skipped: results.filter((r) =>
          ['duplicate_slug', 'duplicate_email'].includes(r.status),
        ).length,
        failed: results.filter((r) =>
          ['invalid_email', 'invalid_tier', 'missing_required', 'plan_not_found', 'unknown_error'].includes(r.status),
        ).length,
      },
    };
  }

  private async validateRow(
    row: ClientImportRow,
  ): Promise<{ status: ImportRowStatus; message?: string }> {
    const name = (row.name || '').trim();
    const slug = (row.slug || '').trim().toLowerCase();
    const adminEmail = (row.adminEmail || '').trim().toLowerCase();

    if (!name || !slug || !adminEmail) {
      return {
        status: 'missing_required',
        message: 'name, slug, and adminEmail are required',
      };
    }

    if (!/^[a-z0-9-]+$/.test(slug)) {
      return {
        status: 'missing_required',
        message: 'slug may only contain lowercase letters, numbers, and hyphens',
      };
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail)) {
      return { status: 'invalid_email' };
    }

    const tier = this.parseTier(row.tier);
    if (tier === null) {
      return { status: 'invalid_tier', message: `tier must be 1, 2, or 3 (got "${row.tier}")` };
    }

    const existingSlug = await this.tenantRepository.findOne({ where: { slug } });
    if (existingSlug) {
      return { status: 'duplicate_slug', message: `slug "${slug}" already exists (tenant #${existingSlug.id})` };
    }
    const existingEmail = await this.userRepository.findOne({ where: { email: adminEmail } });
    if (existingEmail) {
      return { status: 'duplicate_email', message: `admin email already registered (user #${existingEmail.id})` };
    }

    if (row.planId) {
      const planId = parseInt(row.planId, 10);
      if (!Number.isFinite(planId)) {
        return { status: 'plan_not_found', message: `planId "${row.planId}" is not a number` };
      }
      const plan = await this.planRepository.findOne({ where: { id: planId } });
      if (!plan) {
        return { status: 'plan_not_found', message: `plan #${planId} does not exist` };
      }
    }

    return { status: 'ok' };
  }

  // Reuses the same building blocks SuperAdminService.createClient uses
  // (generateApiKey, DEFAULT_TENANT_SETTINGS, TierPolicyService) so a
  // CSV-imported tenant is structurally identical to one created through
  // the UI form. Kept in this file rather than delegating to
  // SuperAdminService.createClient so we can operate inside a per-row
  // transaction without introducing DTO validation quirks.
  private async createOneFromRow(
    row: ClientImportRow,
    createdByUserId: number,
  ): Promise<{ tenantId: number; generatedPassword?: string }> {
    const name = row.name!.trim();
    const slug = row.slug!.trim().toLowerCase();
    const adminEmail = row.adminEmail!.trim().toLowerCase();
    const tier = this.parseTier(row.tier)!;

    let planId: number;
    if (row.planId) {
      planId = parseInt(row.planId, 10);
    } else {
      // Fall back to the free plan; if that's missing, first plan by id.
      // We already know at least one plan exists because validation would
      // have caught a total-empty planId lookup earlier.
      const freePlan = await this.planRepository.findOne({ where: { slug: 'free' } });
      if (freePlan) {
        planId = freePlan.id;
      } else {
        const anyPlan = await this.planRepository.findOne({ where: {}, order: { id: 'ASC' } });
        if (!anyPlan) {
          throw new BadRequestException('No plans exist. Create a plan before importing clients.');
        }
        planId = anyPlan.id;
      }
    }

    // If no password provided, mint a strong random one. We return it in
    // the import result so the operator can distribute reset links via
    // their own channel (email drip, portal invite, etc.).
    let generatedPassword: string | undefined;
    let rawPassword = row.adminPassword?.trim();
    if (!rawPassword) {
      rawPassword = randomBytes(12).toString('base64url');
      generatedPassword = rawPassword;
    }
    const passwordHash = await bcrypt.hash(rawPassword, 13);

    const apiKey = generateApiKey();
    const webhookSecret = crypto.randomBytes(32).toString('hex');

    const seededHours = row.existingCreditHours
      ? parseFloat(row.existingCreditHours)
      : 0;
    const validSeededHours = Number.isFinite(seededHours) ? seededHours : 0;

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const tenant = this.tenantRepository.create({
        name,
        slug,
        domain: row.domain?.trim() || null,
        ownerEmail: adminEmail,
        siteName: row.siteName?.trim() || name,
        apiUrl: null,
        planId,
        apiKeyHash: apiKey.hash,
        apiKeyLast4: apiKey.last4,
        webhookSecret,
        settings: { ...DEFAULT_TENANT_SETTINGS },
        subscriptionStatus: 'active',
        billingCycle: null,
        billingSource: 'manual',
        expiresAt: null,
        graceEndsAt: null,
        adminOverride: false,
        isInternal: false,
        widgetEnabled: true,
        aiSearchEnabled: false,
        feedImagesToR2: false,
        widgetFeatures: ['search', 'detail', 'wishlist'],
        featureFlags: { ...DEFAULT_FEATURE_FLAGS },
        dashboardAddons: this.tierPolicy.presetFor(tier),
        tier,
        xeroContactId: row.xeroContactId?.trim() || null,
      });
      const savedTenant = await queryRunner.manager.save(tenant);

      const adminUser = this.userRepository.create({
        tenantId: savedTenant.id,
        email: adminEmail,
        passwordHash,
        name: row.adminName?.trim() || name,
        role: UserRole.ADMIN,
        isActive: true,
        // Pre-verified: super-admin vouched for the email via the CSV.
        emailVerifiedAt: new Date(),
      });
      await queryRunner.manager.save(adminUser);

      const creditBalance = this.creditBalanceRepository.create({
        tenantId: savedTenant.id,
        balance: validSeededHours,
      });
      await queryRunner.manager.save(creditBalance);

      // Ledger row so the seeded hours are traceable (rather than a mystery
      // opening balance) — matches how the Stripe purchase path logs credit.
      if (validSeededHours > 0) {
        const tx = this.creditTransactionRepository.create({
          tenantId: savedTenant.id,
          type: 'adjustment',
          amount: validSeededHours,
          balanceAfter: validSeededHours,
          description: 'CSV import: opening balance from previous system',
          createdBy: createdByUserId,
        });
        await queryRunner.manager.save(tx);
      }

      const licenseKey = this.licenseKeyRepository.create({
        tenantId: savedTenant.id,
        key: LicenseKey.generateKey(),
        status: 'active',
        domain: row.domain?.trim() || null,
      });
      await queryRunner.manager.save(licenseKey);

      const auditLog = this.auditLogRepository.create({
        tenantId: savedTenant.id,
        userId: createdByUserId,
        action: 'create',
        entityType: 'tenant',
        entityId: savedTenant.id,
        metadata: {
          source: 'csv-import',
          tier,
          seededCreditHours: validSeededHours,
          passwordGenerated: !!generatedPassword,
        },
      });
      await queryRunner.manager.save(auditLog);

      await queryRunner.commitTransaction();
      return { tenantId: savedTenant.id, generatedPassword };
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  private parseTier(raw: string | undefined): TenantTier | null {
    const trimmed = (raw ?? '').trim();
    if (trimmed === '') return 1;
    const n = parseInt(trimmed, 10);
    if (n === 1 || n === 2 || n === 3) return n as TenantTier;
    return null;
  }

  // Minimal RFC-4180-ish CSV parser: handles quoted fields, escaped quotes
  // ("" inside quotes), CRLF/LF line endings, and empty trailing lines.
  // Kept in-file to avoid adding a runtime dependency; the input surface is
  // constrained (super-admin only, well-defined schema).
  private parseCsv(csv: string): { headers: string[]; rows: ClientImportRow[] } {
    const rows: string[][] = [];
    let current: string[] = [];
    let field = '';
    let inQuotes = false;

    // Strip UTF-8 BOM if present so the first header key is clean.
    if (csv.charCodeAt(0) === 0xfeff) csv = csv.slice(1);

    for (let i = 0; i < csv.length; i++) {
      const c = csv[i];
      if (inQuotes) {
        if (c === '"') {
          if (csv[i + 1] === '"') {
            field += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          field += c;
        }
      } else {
        if (c === '"') {
          inQuotes = true;
        } else if (c === ',') {
          current.push(field);
          field = '';
        } else if (c === '\r') {
          // consume LF that may follow
        } else if (c === '\n') {
          current.push(field);
          field = '';
          rows.push(current);
          current = [];
        } else {
          field += c;
        }
      }
    }
    // Flush trailing field/row (no newline at EOF)
    if (field.length > 0 || current.length > 0) {
      current.push(field);
      rows.push(current);
    }

    // Discard fully-empty rows (empty trailing line from a text editor).
    const nonEmpty = rows.filter((r) => r.some((v) => v.trim() !== ''));
    if (nonEmpty.length === 0) {
      return { headers: [], rows: [] };
    }

    const headers = nonEmpty[0].map((h) => h.trim());
    const dataRows: ClientImportRow[] = nonEmpty.slice(1).map((cols) => {
      const obj: Record<string, string> = {};
      for (let idx = 0; idx < headers.length; idx++) {
        obj[headers[idx]] = (cols[idx] ?? '').trim();
      }
      return obj as ClientImportRow;
    });

    return { headers, rows: dataRows };
  }
}
