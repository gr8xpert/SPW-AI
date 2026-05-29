import { MigrationInterface, QueryRunner } from 'typeorm';

export class PropertyEnergyRating1776327000000 implements MigrationInterface {
  name = 'PropertyEnergyRating1776327000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE properties
        ADD COLUMN energyRating VARCHAR(2) NULL AFTER energyConsumption
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE properties DROP COLUMN energyRating
    `);
  }
}
