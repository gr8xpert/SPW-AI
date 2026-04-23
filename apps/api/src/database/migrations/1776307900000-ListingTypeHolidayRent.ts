import { MigrationInterface, QueryRunner } from 'typeorm';

export class ListingTypeHolidayRent1776307900000 implements MigrationInterface {
  name = 'ListingTypeHolidayRent1776307900000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE properties
        MODIFY COLUMN listingType ENUM('sale', 'rent', 'holiday_rent', 'development') NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE properties SET listingType = 'rent' WHERE listingType = 'holiday_rent'
    `);
    await queryRunner.query(`
      ALTER TABLE properties
        MODIFY COLUMN listingType ENUM('sale', 'rent', 'development') NOT NULL
    `);
  }
}
