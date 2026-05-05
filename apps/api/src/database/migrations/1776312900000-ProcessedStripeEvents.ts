import { MigrationInterface, QueryRunner } from 'typeorm';

export class ProcessedStripeEvents1776312900000 implements MigrationInterface {
  name = 'ProcessedStripeEvents1776312900000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE processed_stripe_events (
        eventId VARCHAR(100) NOT NULL PRIMARY KEY,
        eventType VARCHAR(100) NOT NULL,
        processedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_processed_stripe_events_type (eventType),
        INDEX idx_processed_stripe_events_processed_at (processedAt)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS processed_stripe_events`);
  }
}
