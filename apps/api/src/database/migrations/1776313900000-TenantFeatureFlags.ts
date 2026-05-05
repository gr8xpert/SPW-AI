import { MigrationInterface, QueryRunner } from 'typeorm';

export class TenantFeatureFlags1776313900000 implements MigrationInterface {
  name = 'TenantFeatureFlags1776313900000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const allEnabled = JSON.stringify({
      mapSearch: true,
      mapView: true,
      aiSearch: true,
      aiChatbot: true,
      mortgageCalculator: true,
      currencyConverter: true,
    });

    await queryRunner.query(
      `ALTER TABLE tenants ADD COLUMN featureFlags JSON NOT NULL DEFAULT ('${allEnabled}')`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE tenants DROP COLUMN featureFlags`);
  }
}
