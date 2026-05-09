import { MigrationInterface, QueryRunner } from 'typeorm';

// Dashboard-side per-tenant add-on flags. Super-admin toggles each from
// the Clients page; locked features show as greyed in the dashboard
// with an upgrade prompt. Default JSON keeps every flag at false so
// existing tenants stay locked until super-admin opts them in.
export class DashboardAddons1776321000000 implements MigrationInterface {
  name = 'DashboardAddons1776321000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const colExists: { c: number }[] = await queryRunner.query(
      `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tenants'
         AND COLUMN_NAME = 'dashboardAddons'`,
    );
    if (Number(colExists[0]?.c ?? 0) === 0) {
      await queryRunner.query(
        `ALTER TABLE tenants
           ADD COLUMN dashboardAddons JSON
             DEFAULT (JSON_OBJECT(
               'addProperty', false,
               'emailCampaign', false,
               'feedExport', false,
               'team', false,
               'aiChat', false
             ))`,
      );
      // MySQL JSON column DEFAULT applies on INSERT only; backfill any
      // pre-existing rows so reads always return a populated object.
      await queryRunner.query(
        `UPDATE tenants SET dashboardAddons = JSON_OBJECT(
           'addProperty', false,
           'emailCampaign', false,
           'feedExport', false,
           'team', false,
           'aiChat', false
         ) WHERE dashboardAddons IS NULL`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const colExists: { c: number }[] = await queryRunner.query(
      `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tenants'
         AND COLUMN_NAME = 'dashboardAddons'`,
    );
    if (Number(colExists[0]?.c ?? 0) > 0) {
      await queryRunner.query(`ALTER TABLE tenants DROP COLUMN dashboardAddons`);
    }
  }
}
