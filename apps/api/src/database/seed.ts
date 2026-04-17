/**
 * Idempotent database seed.
 *
 * Creates baseline rows so a fresh environment can serve traffic:
 *   - Plans: free / starter / pro / enterprise
 *   - Optionally: a super-admin user + holding tenant, if
 *     SEED_SUPER_ADMIN_EMAIL and SEED_SUPER_ADMIN_PASSWORD are set.
 *
 * Every step checks for existing rows first, so re-running is safe.
 *
 * Usage:
 *   cd apps/api
 *   pnpm build
 *   node dist/database/seed.js
 */
import 'reflect-metadata';
import * as bcrypt from 'bcrypt';
import { DataSource } from 'typeorm';
import dataSource from '../config/database.config';
import { Plan } from './entities/plan.entity';
import { Tenant } from './entities/tenant.entity';
import { User } from './entities/user.entity';
import { UserRole } from '@spw/shared';

interface PlanSeed {
  name: string;
  slug: string;
  priceMonthly: number | null;
  priceYearly: number | null;
  maxProperties: number;
  maxUsers: number;
  features: {
    feeds: boolean;
    campaigns: boolean;
    analytics: boolean;
    apiAccess: boolean;
    customBranding: boolean;
  };
}

const PLAN_SEEDS: PlanSeed[] = [
  {
    name: 'Free',
    slug: 'free',
    priceMonthly: 0,
    priceYearly: 0,
    maxProperties: 25,
    maxUsers: 1,
    features: {
      feeds: false,
      campaigns: false,
      analytics: false,
      apiAccess: false,
      customBranding: false,
    },
  },
  {
    name: 'Starter',
    slug: 'starter',
    priceMonthly: 29,
    priceYearly: 290,
    maxProperties: 250,
    maxUsers: 3,
    features: {
      feeds: true,
      campaigns: false,
      analytics: true,
      apiAccess: true,
      customBranding: false,
    },
  },
  {
    name: 'Pro',
    slug: 'pro',
    priceMonthly: 99,
    priceYearly: 990,
    maxProperties: 2500,
    maxUsers: 10,
    features: {
      feeds: true,
      campaigns: true,
      analytics: true,
      apiAccess: true,
      customBranding: true,
    },
  },
  {
    name: 'Enterprise',
    slug: 'enterprise',
    priceMonthly: null,
    priceYearly: null,
    maxProperties: 100_000,
    maxUsers: 100,
    features: {
      feeds: true,
      campaigns: true,
      analytics: true,
      apiAccess: true,
      customBranding: true,
    },
  },
];

async function seedPlans(ds: DataSource): Promise<void> {
  const repo = ds.getRepository(Plan);
  for (const seed of PLAN_SEEDS) {
    const existing = await repo.findOne({ where: { slug: seed.slug } });
    if (existing) {
      console.log(`[plan] ${seed.slug} already exists — skipping`);
      continue;
    }
    await repo.save(repo.create(seed));
    console.log(`[plan] ${seed.slug} created`);
  }
}

async function seedSuperAdmin(ds: DataSource): Promise<void> {
  const email = process.env.SEED_SUPER_ADMIN_EMAIL;
  const password = process.env.SEED_SUPER_ADMIN_PASSWORD;

  if (!email || !password) {
    console.log('[super-admin] SEED_SUPER_ADMIN_EMAIL / _PASSWORD not set — skipping');
    return;
  }

  if (password.length < 12) {
    throw new Error('SEED_SUPER_ADMIN_PASSWORD must be at least 12 characters');
  }

  const userRepo = ds.getRepository(User);
  const existing = await userRepo.findOne({ where: { email: email.toLowerCase() } });
  if (existing) {
    console.log(`[super-admin] ${email} already exists — skipping`);
    return;
  }

  const tenantRepo = ds.getRepository(Tenant);
  const planRepo = ds.getRepository(Plan);

  const enterprisePlan = await planRepo.findOne({ where: { slug: 'enterprise' } });
  if (!enterprisePlan) {
    throw new Error('Enterprise plan is missing — seed plans first');
  }

  // Super-admin lives on a dedicated internal tenant so tenant-scoped queries
  // don't accidentally leak platform-admin data. The generated API key is
  // discarded — the internal tenant isn't meant to call public API endpoints.
  // Rotate via the super-admin UI if it ever needs one.
  let holdingTenant = await tenantRepo.findOne({ where: { slug: 'platform' } });
  if (!holdingTenant) {
    const { generateApiKey } = await import('../common/crypto/api-key');
    const platformKey = generateApiKey();
    holdingTenant = await tenantRepo.save(
      tenantRepo.create({
        name: 'Platform',
        slug: 'platform',
        planId: enterprisePlan.id,
        isInternal: true,
        apiKeyHash: platformKey.hash,
        apiKeyLast4: platformKey.last4,
        webhookSecret: require('crypto').randomBytes(32).toString('hex'),
      }),
    );
    console.log('[tenant] platform (internal) created');
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await userRepo.save(
    userRepo.create({
      tenantId: holdingTenant.id,
      email: email.toLowerCase(),
      passwordHash,
      name: 'Platform Admin',
      role: UserRole.SUPER_ADMIN,
      isActive: true,
      // Seeded super-admin is considered verified — the email is provided out
      // of band by the operator running the seed, not collected through the
      // normal signup flow.
      emailVerifiedAt: new Date(),
    }),
  );
  console.log(`[super-admin] ${email} created`);
}

async function main(): Promise<void> {
  const ds = await dataSource.initialize();
  try {
    await seedPlans(ds);
    await seedSuperAdmin(ds);
    console.log('\nSeed complete.');
  } finally {
    await ds.destroy();
  }
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
