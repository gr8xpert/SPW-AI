import { MigrationInterface, QueryRunner } from 'typeorm';

// Extend feed_configs.provider ENUM to include 'kyero' and 'odoo' so
// tenants can configure the new feed sources in the dashboard.
export class FeedProviderKyeroOdoo1776318000000 implements MigrationInterface {
  name = 'FeedProviderKyeroOdoo1776318000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE feed_configs
         MODIFY COLUMN provider ENUM('resales', 'inmoba', 'infocasa', 'redsp', 'kyero', 'odoo') NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Revert: drop kyero/odoo configs first to avoid truncation, then narrow the enum.
    await queryRunner.query(`DELETE FROM feed_configs WHERE provider IN ('kyero', 'odoo')`);
    await queryRunner.query(
      `ALTER TABLE feed_configs
         MODIFY COLUMN provider ENUM('resales', 'inmoba', 'infocasa', 'redsp') NOT NULL`,
    );
  }
}
