import { MigrationInterface, QueryRunner } from 'typeorm';

export class PropertyRangeFields1776308900000 implements MigrationInterface {
  name = 'PropertyRangeFields1776308900000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE properties
        ADD COLUMN priceTo DECIMAL(15,2) NULL AFTER price,
        ADD COLUMN bedroomsTo TINYINT UNSIGNED NULL AFTER bedrooms,
        ADD COLUMN bathroomsTo TINYINT UNSIGNED NULL AFTER bathrooms,
        ADD COLUMN buildSizeTo DECIMAL(10,2) NULL AFTER buildSize,
        ADD COLUMN plotSizeTo DECIMAL(10,2) NULL AFTER plotSize,
        ADD COLUMN terraceSizeTo DECIMAL(10,2) NULL AFTER terraceSize
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE properties
        DROP COLUMN priceTo,
        DROP COLUMN bedroomsTo,
        DROP COLUMN bathroomsTo,
        DROP COLUMN buildSizeTo,
        DROP COLUMN plotSizeTo,
        DROP COLUMN terraceSizeTo
    `);
  }
}
