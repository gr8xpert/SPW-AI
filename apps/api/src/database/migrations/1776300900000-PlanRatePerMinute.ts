import { MigrationInterface, QueryRunner } from 'typeorm';

// Adds a per-plan rate limit for the public API. ApiKeyThrottlerGuard resolves
// this at request time so upgrading a tenant's plan lifts their ceiling without
// a code change or restart. Defaults chosen to match the previous hardcoded
// 60/min for Free and give headroom on paid tiers.
export class PlanRatePerMinute1776300900000 implements MigrationInterface {
  name = 'PlanRatePerMinute1776300900000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE plans
        ADD COLUMN ratePerMinute INT NOT NULL DEFAULT 60 AFTER maxUsers
    `);

    await queryRunner.query(`UPDATE plans SET ratePerMinute = 30 WHERE slug = 'free'`);
    await queryRunner.query(`UPDATE plans SET ratePerMinute = 120 WHERE slug = 'starter'`);
    await queryRunner.query(`UPDATE plans SET ratePerMinute = 600 WHERE slug = 'pro'`);
    await queryRunner.query(`UPDATE plans SET ratePerMinute = 3000 WHERE slug = 'enterprise'`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE plans DROP COLUMN ratePerMinute`);
  }
}
