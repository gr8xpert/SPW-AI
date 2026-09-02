import { MigrationInterface, QueryRunner } from 'typeorm';

// Adds the 3-tier commercial plan column (Tier 1/2/3) and an optional
// xeroContactId for the n8n → Xero invoice sync. Existing rows are
// backfilled to Tier 1 per operator decision (opt-in upgrade model).
// The application layer maintains tier ↔ dashboardAddons consistency
// via TierPolicyService; the DB stores tier as an independent column so
// super-admin overrides on individual add-ons can persist above the
// preset (Tier 2 tenant with aiChat manually enabled, etc.).
export class TenantTierAndXeroContact1777000000000 implements MigrationInterface {
  name = 'TenantTierAndXeroContact1777000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const tierExists: { c: number }[] = await queryRunner.query(
      `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tenants'
         AND COLUMN_NAME = 'tier'`,
    );
    if (Number(tierExists[0]?.c ?? 0) === 0) {
      await queryRunner.query(
        `ALTER TABLE tenants
           ADD COLUMN tier SMALLINT NOT NULL DEFAULT 1`,
      );
      // Grandfather every existing row to Tier 1 explicitly. Super-admin
      // must upgrade any active tenants that need Tier 2/3 features.
      await queryRunner.query(`UPDATE tenants SET tier = 1 WHERE tier IS NULL OR tier = 0`);
    }

    const xeroExists: { c: number }[] = await queryRunner.query(
      `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tenants'
         AND COLUMN_NAME = 'xeroContactId'`,
    );
    if (Number(xeroExists[0]?.c ?? 0) === 0) {
      await queryRunner.query(
        `ALTER TABLE tenants
           ADD COLUMN xeroContactId VARCHAR(64) NULL`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const xeroExists: { c: number }[] = await queryRunner.query(
      `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tenants'
         AND COLUMN_NAME = 'xeroContactId'`,
    );
    if (Number(xeroExists[0]?.c ?? 0) > 0) {
      await queryRunner.query(`ALTER TABLE tenants DROP COLUMN xeroContactId`);
    }
    const tierExists: { c: number }[] = await queryRunner.query(
      `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tenants'
         AND COLUMN_NAME = 'tier'`,
    );
    if (Number(tierExists[0]?.c ?? 0) > 0) {
      await queryRunner.query(`ALTER TABLE tenants DROP COLUMN tier`);
    }
  }
}
