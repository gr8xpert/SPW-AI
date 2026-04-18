import { MigrationInterface, QueryRunner } from 'typeorm';

// 6E — Paddle checkout needs a price_id to create a transaction, and each
// plan has two (monthly + yearly). Keeping them on the plan row (as opposed
// to a separate plan_prices table) is the simplest shape that covers the
// current product: one price per (plan, billing-cycle). If we ever add
// currency-specific prices or grandfathered tiers, we split this out.
//
// Columns are nullable because a plan can exist without Paddle wiring (free
// tier, internal plan, or just not-yet-configured). The checkout endpoint
// rejects with 400 when the requested cycle's price_id is missing rather
// than silently letting Paddle error out.
export class PlanPaddlePriceIds1776305900000 implements MigrationInterface {
  name = 'PlanPaddlePriceIds1776305900000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE plans
         ADD COLUMN paddlePriceIdMonthly VARCHAR(100) NULL,
         ADD COLUMN paddlePriceIdYearly VARCHAR(100) NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE plans
         DROP COLUMN paddlePriceIdMonthly,
         DROP COLUMN paddlePriceIdYearly`,
    );
  }
}
