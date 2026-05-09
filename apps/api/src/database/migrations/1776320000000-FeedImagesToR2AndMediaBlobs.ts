import { MigrationInterface, QueryRunner } from 'typeorm';

// Two related additions for the super-admin "download feed images to R2"
// toggle and content-hash deduplication.
//
//   1. tenants.feedImagesToR2 boolean. Default false — feed images keep
//      their provider CDN URL unless the operator explicitly opts in
//      per-tenant.
//
//   2. media_blobs table. Content-addressed storage with reference
//      counting so identical bytes (same villa photo across 50 feed
//      listings) only consume one R2 object.
//
//   3. media_files.contentHash + thumbnailContentHash so the upload
//      service can call releaseBlob() on delete.
export class FeedImagesToR2AndMediaBlobs1776320000000 implements MigrationInterface {
  name = 'FeedImagesToR2AndMediaBlobs1776320000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const colExists = async (table: string, col: string): Promise<boolean> => {
      const rows: { c: number }[] = await queryRunner.query(
        `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
        [table, col],
      );
      return Number(rows[0]?.c ?? 0) > 0;
    };

    const tableExists = async (table: string): Promise<boolean> => {
      const rows: { c: number }[] = await queryRunner.query(
        `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.TABLES
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
        [table],
      );
      return Number(rows[0]?.c ?? 0) > 0;
    };

    if (!(await colExists('tenants', 'feedImagesToR2'))) {
      await queryRunner.query(
        `ALTER TABLE tenants
           ADD COLUMN feedImagesToR2 TINYINT(1) NOT NULL DEFAULT 0 AFTER aiSearchEnabled`,
      );
    }

    if (!(await colExists('media_files', 'contentHash'))) {
      await queryRunner.query(
        `ALTER TABLE media_files
           ADD COLUMN contentHash CHAR(64) NULL AFTER thumbnailUrl,
           ADD COLUMN thumbnailContentHash CHAR(64) NULL AFTER contentHash`,
      );
    }

    if (!(await tableExists('media_blobs'))) {
      await queryRunner.query(`
        CREATE TABLE media_blobs (
          id INT PRIMARY KEY AUTO_INCREMENT,
          tenantId INT NOT NULL,
          contentHash CHAR(64) NOT NULL,
          storageKey VARCHAR(500) NOT NULL,
          storageType ENUM('local', 's3') NOT NULL DEFAULT 's3',
          size INT NOT NULL,
          mimeType VARCHAR(100) NOT NULL DEFAULT 'image/webp',
          refCount INT NOT NULL DEFAULT 1,
          createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE KEY uniq_media_blobs_tenant_hash (tenantId, contentHash),
          INDEX idx_media_blobs_tenant_refcount (tenantId, refCount),
          CONSTRAINT fk_media_blobs_tenant
            FOREIGN KEY (tenantId) REFERENCES tenants(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS media_blobs`);

    const colExists = async (table: string, col: string): Promise<boolean> => {
      const rows: { c: number }[] = await queryRunner.query(
        `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
        [table, col],
      );
      return Number(rows[0]?.c ?? 0) > 0;
    };

    if (await colExists('media_files', 'contentHash')) {
      await queryRunner.query(
        `ALTER TABLE media_files
           DROP COLUMN thumbnailContentHash,
           DROP COLUMN contentHash`,
      );
    }

    if (await colExists('tenants', 'feedImagesToR2')) {
      await queryRunner.query(`ALTER TABLE tenants DROP COLUMN feedImagesToR2`);
    }
  }
}
