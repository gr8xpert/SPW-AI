import { MigrationInterface, QueryRunner } from 'typeorm';

export class PropertyBrochureVariant1776328000000 implements MigrationInterface {
  name = 'PropertyBrochureVariant1776328000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE properties
        ADD COLUMN brochureVariant ENUM('inherit','branded','unbranded') NOT NULL DEFAULT 'inherit' AFTER syncEnabled
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE properties DROP COLUMN brochureVariant
    `);
  }
}
