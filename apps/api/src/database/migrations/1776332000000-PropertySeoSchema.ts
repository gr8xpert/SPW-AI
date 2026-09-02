import { MigrationInterface, QueryRunner } from 'typeorm';

// Adds a nullable `seoSchemaJson` TEXT column to properties for custom
// JSON-LD schema overrides. Widget prefers this value when set; falls back
// to an auto-generated RealEstateListing block otherwise.
export class PropertySeoSchema1776332000000 implements MigrationInterface {
  name = 'PropertySeoSchema1776332000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const colExists: { c: number }[] = await queryRunner.query(
      `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'properties'
         AND COLUMN_NAME = 'seoSchemaJson'`,
    );
    if (Number(colExists[0]?.c ?? 0) === 0) {
      await queryRunner.query(
        `ALTER TABLE properties ADD COLUMN seoSchemaJson TEXT NULL`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const colExists: { c: number }[] = await queryRunner.query(
      `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'properties'
         AND COLUMN_NAME = 'seoSchemaJson'`,
    );
    if (Number(colExists[0]?.c ?? 0) > 0) {
      await queryRunner.query(`ALTER TABLE properties DROP COLUMN seoSchemaJson`);
    }
  }
}
