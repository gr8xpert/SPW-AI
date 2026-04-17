import { MigrationInterface, QueryRunner } from 'typeorm';

// Adds tenants.lastCacheClearedAt — the timestamp of the most recent
// "Clear widget cache" action against this tenant. Before this migration
// the UI generated a fresh ISO string per click but never persisted it,
// so a dashboard refresh dropped the signal and support had no way to
// tell when a client's cache was last nudged.
//
// Nullable because rows that existed before this migration never had a
// clear performed against them. Reset-on-clear semantics are handled in
// tenantService.clearCache.
export class TenantLastCacheClearedAt1776302900000 implements MigrationInterface {
  name = 'TenantLastCacheClearedAt1776302900000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE tenants ADD COLUMN lastCacheClearedAt TIMESTAMP NULL DEFAULT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE tenants DROP COLUMN lastCacheClearedAt`,
    );
  }
}
