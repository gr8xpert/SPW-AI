import { MigrationInterface, QueryRunner } from 'typeorm';

// 6A — Paddle inbound webhook idempotency. We record every event we've
// acted on by its Paddle eventId. On replay (Paddle retries until it sees
// a 2xx), the INSERT collides on the PK and we short-circuit with 200.
// Keeping it in its own tiny table (rather than a flag on subscription_payments)
// means every event type — subscription.created, transaction.completed,
// subscription.canceled, etc. — can dedup uniformly, not just the ones
// that happen to write a payment row.
export class ProcessedPaddleEvents1776304900000 implements MigrationInterface {
  name = 'ProcessedPaddleEvents1776304900000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE processed_paddle_events (
        eventId VARCHAR(100) NOT NULL PRIMARY KEY,
        eventType VARCHAR(100) NOT NULL,
        processedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_processed_paddle_events_type (eventType),
        INDEX idx_processed_paddle_events_processed_at (processedAt)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS processed_paddle_events`);
  }
}
