import { MigrationInterface, QueryRunner } from 'typeorm';

// Adds parentId to property_types so users can group child types
// (e.g. "Detached Villa", "Semi-Detached Villa") under a manually
// created parent ("Villas"). The widget search expands a selected
// parent type to include all its descendants.
export class PropertyTypeParent1776322000000 implements MigrationInterface {
  name = 'PropertyTypeParent1776322000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const colExists: { c: number }[] = await queryRunner.query(
      `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'property_types'
         AND COLUMN_NAME = 'parentId'`,
    );
    if (Number(colExists[0]?.c ?? 0) === 0) {
      await queryRunner.query(
        `ALTER TABLE property_types ADD COLUMN parentId INT NULL`,
      );
      await queryRunner.query(
        `ALTER TABLE property_types
           ADD CONSTRAINT fk_property_types_parent
           FOREIGN KEY (parentId) REFERENCES property_types(id) ON DELETE SET NULL`,
      );
      await queryRunner.query(
        `CREATE INDEX idx_property_types_parentId ON property_types(parentId)`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const colExists: { c: number }[] = await queryRunner.query(
      `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'property_types'
         AND COLUMN_NAME = 'parentId'`,
    );
    if (Number(colExists[0]?.c ?? 0) > 0) {
      await queryRunner.query(`ALTER TABLE property_types DROP FOREIGN KEY fk_property_types_parent`).catch(() => {});
      await queryRunner.query(`DROP INDEX idx_property_types_parentId ON property_types`).catch(() => {});
      await queryRunner.query(`ALTER TABLE property_types DROP COLUMN parentId`);
    }
  }
}
