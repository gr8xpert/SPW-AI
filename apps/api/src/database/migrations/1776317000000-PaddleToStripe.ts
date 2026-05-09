import { MigrationInterface, QueryRunner } from 'typeorm';

// Migrate the payment system from Paddle to Stripe-only.
//
// What this does:
//   1. tenants.billingSource enum: 'paddle' → 'stripe' (and any rows with
//      billingSource='paddle' get re-tagged 'stripe').
//   2. subscription_payments: rename paddle* columns → stripe* columns,
//      swap the index from paddleTransactionId to stripeSubscriptionId.
//   3. plans: rename paddlePriceIdMonthly/Yearly → stripePriceIdMonthly/Yearly.
//   4. Drop the processed_paddle_events idempotency table (replaced by
//      processed_stripe_events, which already exists).
//
// All steps are idempotent — they check INFORMATION_SCHEMA before each
// rename so the migration is safe on both:
//   - existing production DBs that came through the Paddle schema, AND
//   - fresh installs that never had Paddle columns.
export class PaddleToStripe1776317000000 implements MigrationInterface {
  name = 'PaddleToStripe1776317000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Helper: rename column only if old name exists.
    const renameIfExists = async (
      table: string,
      oldName: string,
      newName: string,
      typeDef: string,
    ): Promise<void> => {
      const rows: { c: number }[] = await queryRunner.query(
        `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
        [table, oldName],
      );
      if (Number(rows[0]?.c ?? 0) > 0) {
        await queryRunner.query(
          `ALTER TABLE \`${table}\` CHANGE \`${oldName}\` \`${newName}\` ${typeDef}`,
        );
      }
    };

    const indexExists = async (table: string, name: string): Promise<boolean> => {
      const rows: { c: number }[] = await queryRunner.query(
        `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.STATISTICS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
        [table, name],
      );
      return Number(rows[0]?.c ?? 0) > 0;
    };

    // 1. Widen the enum first to allow 'stripe' (still keeping 'paddle' for
    //    the UPDATE to succeed without truncation), re-tag rows, then narrow.
    await queryRunner.query(
      `ALTER TABLE tenants
         MODIFY COLUMN billingSource ENUM('manual', 'paddle', 'stripe', 'internal') NULL`,
    );
    await queryRunner.query(
      `UPDATE tenants SET billingSource = 'stripe' WHERE billingSource = 'paddle'`,
    );
    await queryRunner.query(
      `ALTER TABLE tenants
         MODIFY COLUMN billingSource ENUM('manual', 'stripe', 'internal') NULL`,
    );

    // 2. subscription_payments column renames.
    await renameIfExists(
      'subscription_payments',
      'paddleTransactionId',
      'stripePaymentIntentId',
      'VARCHAR(255) NULL',
    );
    await renameIfExists(
      'subscription_payments',
      'paddleSubscriptionId',
      'stripeSubscriptionId',
      'VARCHAR(255) NULL',
    );
    await renameIfExists(
      'subscription_payments',
      'paddleCustomerId',
      'stripeCustomerId',
      'VARCHAR(255) NULL',
    );
    await renameIfExists(
      'subscription_payments',
      'paddleWebhookData',
      'stripeWebhookData',
      'JSON NULL',
    );

    if (await indexExists('subscription_payments', 'idx_paddle_txn')) {
      await queryRunner.query(`ALTER TABLE subscription_payments DROP INDEX idx_paddle_txn`);
    }
    if (!(await indexExists('subscription_payments', 'idx_stripe_sub'))) {
      await queryRunner.query(
        `ALTER TABLE subscription_payments
           ADD INDEX idx_stripe_sub (stripeSubscriptionId)`,
      );
    }

    // 3. plans price-id columns: rename if Paddle ones exist; otherwise
    //    create the Stripe ones (covers fresh installs that never had the
    //    deleted PlanPaddlePriceIds migration).
    const paddleMonthly: { c: number }[] = await queryRunner.query(
      `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'plans'
         AND COLUMN_NAME = 'paddlePriceIdMonthly'`,
    );
    const stripeMonthly: { c: number }[] = await queryRunner.query(
      `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'plans'
         AND COLUMN_NAME = 'stripePriceIdMonthly'`,
    );

    if (Number(paddleMonthly[0]?.c ?? 0) > 0) {
      await renameIfExists('plans', 'paddlePriceIdMonthly', 'stripePriceIdMonthly', 'VARCHAR(100) NULL');
      await renameIfExists('plans', 'paddlePriceIdYearly', 'stripePriceIdYearly', 'VARCHAR(100) NULL');
    } else if (Number(stripeMonthly[0]?.c ?? 0) === 0) {
      await queryRunner.query(
        `ALTER TABLE plans
           ADD COLUMN stripePriceIdMonthly VARCHAR(100) NULL,
           ADD COLUMN stripePriceIdYearly VARCHAR(100) NULL`,
      );
    }

    // 4. Drop the Paddle idempotency table. processed_stripe_events
    //    already exists from migration 1776312900000.
    await queryRunner.query(`DROP TABLE IF EXISTS processed_paddle_events`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Reverse the migration. Used for local dev rollback only — production
    // should never need to go back to Paddle.
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS processed_paddle_events (
         eventId VARCHAR(100) NOT NULL PRIMARY KEY,
         eventType VARCHAR(100) NOT NULL,
         processedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
         INDEX idx_processed_paddle_events_type (eventType),
         INDEX idx_processed_paddle_events_processed_at (processedAt)
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    );

    await queryRunner.query(
      `ALTER TABLE plans
         CHANGE stripePriceIdMonthly paddlePriceIdMonthly VARCHAR(100) NULL,
         CHANGE stripePriceIdYearly paddlePriceIdYearly VARCHAR(100) NULL`,
    );

    await queryRunner.query(`ALTER TABLE subscription_payments DROP INDEX IF EXISTS idx_stripe_sub`);
    await queryRunner.query(
      `ALTER TABLE subscription_payments
         CHANGE stripePaymentIntentId paddleTransactionId VARCHAR(255) NULL,
         CHANGE stripeSubscriptionId paddleSubscriptionId VARCHAR(255) NULL,
         CHANGE stripeCustomerId paddleCustomerId VARCHAR(255) NULL,
         CHANGE stripeWebhookData paddleWebhookData JSON NULL,
         ADD INDEX idx_paddle_txn (paddleTransactionId)`,
    );

    await queryRunner.query(
      `ALTER TABLE tenants
         MODIFY COLUMN billingSource ENUM('manual', 'paddle', 'stripe', 'internal') NULL`,
    );
    await queryRunner.query(
      `UPDATE tenants SET billingSource = 'paddle' WHERE billingSource = 'stripe'`,
    );
    await queryRunner.query(
      `ALTER TABLE tenants
         MODIFY COLUMN billingSource ENUM('manual', 'paddle', 'internal') NULL`,
    );
  }
}
