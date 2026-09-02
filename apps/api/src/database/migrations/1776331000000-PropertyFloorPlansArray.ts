import { MigrationInterface, QueryRunner } from 'typeorm';

// Adds a `floorPlans` JSON column to properties for multi-floor-plan support.
// Backfills the array from the existing single `floorPlanUrl` column so
// nothing changes for existing rows: `floorPlans` starts as
// `[{ url: floorPlanUrl }]` when that URL was set, otherwise NULL.
//
// `floorPlanUrl` stays put — feed importers and legacy consumers still read
// it, and the property service mirrors `floorPlans[0].url` into it on save.
export class PropertyFloorPlansArray1776331000000 implements MigrationInterface {
  name = 'PropertyFloorPlansArray1776331000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const colExists: { c: number }[] = await queryRunner.query(
      `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'properties'
         AND COLUMN_NAME = 'floorPlans'`,
    );
    if (Number(colExists[0]?.c ?? 0) === 0) {
      await queryRunner.query(
        `ALTER TABLE properties ADD COLUMN floorPlans JSON NULL`,
      );
    }
    await queryRunner.query(
      `UPDATE properties
         SET floorPlans = JSON_ARRAY(JSON_OBJECT('url', floorPlanUrl))
       WHERE floorPlans IS NULL
         AND floorPlanUrl IS NOT NULL
         AND floorPlanUrl <> ''`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const colExists: { c: number }[] = await queryRunner.query(
      `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'properties'
         AND COLUMN_NAME = 'floorPlans'`,
    );
    if (Number(colExists[0]?.c ?? 0) > 0) {
      await queryRunner.query(`ALTER TABLE properties DROP COLUMN floorPlans`);
    }
  }
}
