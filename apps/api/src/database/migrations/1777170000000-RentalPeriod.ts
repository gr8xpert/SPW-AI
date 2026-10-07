import { MigrationInterface, QueryRunner } from 'typeorm';

// properties.rentalPeriod: what a rental price covers — 'night' | 'week' |
// 'month' (Resales RentalPeriod, Kyero price_freq, or set in the dashboard).
// NULL = a plain price. Prices themselves stay in price (from) / priceTo (to).
export class RentalPeriod1777170000000 implements MigrationInterface {
  name = 'RentalPeriod1777170000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('properties', 'rentalPeriod'))) {
      await queryRunner.query('ALTER TABLE properties ADD COLUMN rentalPeriod VARCHAR(10) NULL AFTER priceTo');
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE properties DROP COLUMN rentalPeriod');
  }
}
