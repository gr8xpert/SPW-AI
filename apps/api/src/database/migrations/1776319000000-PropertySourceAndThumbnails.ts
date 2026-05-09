import { MigrationInterface, QueryRunner } from 'typeorm';

// Two related changes for the feed-source / image-storage routing work:
//
//   1. properties.source ENUM gains 'kyero' and 'odoo' so feed imports
//      from the new adapters can record the right origin.
//
//   2. media_files gains thumbnailPath / thumbnailUrl. Client-uploaded
//      images now generate a 400×400 cover-crop thumbnail alongside the
//      main WebP — the listing grid serves the thumb instead of the full
//      image, saving bandwidth on the widget.
export class PropertySourceAndThumbnails1776319000000 implements MigrationInterface {
  name = 'PropertySourceAndThumbnails1776319000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE properties
         MODIFY COLUMN source
         ENUM('resales', 'inmoba', 'infocasa', 'redsp', 'kyero', 'odoo', 'manual')
         NOT NULL DEFAULT 'manual'`,
    );

    const hasThumbPath: { c: number }[] = await queryRunner.query(
      `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'media_files'
         AND COLUMN_NAME = 'thumbnailPath'`,
    );
    if (Number(hasThumbPath[0]?.c ?? 0) === 0) {
      await queryRunner.query(
        `ALTER TABLE media_files
           ADD COLUMN thumbnailPath VARCHAR(500) NULL AFTER url,
           ADD COLUMN thumbnailUrl VARCHAR(500) NULL AFTER thumbnailPath`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasThumbPath: { c: number }[] = await queryRunner.query(
      `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'media_files'
         AND COLUMN_NAME = 'thumbnailPath'`,
    );
    if (Number(hasThumbPath[0]?.c ?? 0) > 0) {
      await queryRunner.query(
        `ALTER TABLE media_files
           DROP COLUMN thumbnailUrl,
           DROP COLUMN thumbnailPath`,
      );
    }

    // Reset any kyero/odoo rows to 'manual' before narrowing the enum.
    await queryRunner.query(
      `UPDATE properties SET source = 'manual' WHERE source IN ('kyero', 'odoo')`,
    );
    await queryRunner.query(
      `ALTER TABLE properties
         MODIFY COLUMN source
         ENUM('resales', 'inmoba', 'infocasa', 'redsp', 'manual')
         NOT NULL DEFAULT 'manual'`,
    );
  }
}
