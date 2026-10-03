import { MigrationInterface, QueryRunner } from 'typeorm';

// tenants.lastStripeEventAt: `created` (unix seconds) of the newest Stripe
// subscription/invoice event applied to the tenant. Stripe doesn't deliver
// events in order, so an older event arriving late (say "updated: active"
// after "deleted") is recognised and no longer rolls the subscription back.
// NULL = nothing applied since this column existed; the next event sets it.
export class StripeEventOrder1777150000000 implements MigrationInterface {
  name = 'StripeEventOrder1777150000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('tenants', 'lastStripeEventAt'))) {
      await queryRunner.query('ALTER TABLE tenants ADD COLUMN lastStripeEventAt INT UNSIGNED NULL');
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE tenants DROP COLUMN lastStripeEventAt');
  }
}
