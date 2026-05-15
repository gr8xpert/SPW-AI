import { MigrationInterface, QueryRunner } from 'typeorm';

// Adds a `channel` discriminator to webhook_deliveries so the same pipeline
// can dispatch to either the tenant's main webhook URL (tenant.webhookUrl)
// or the dedicated inquiry webhook URL (tenant.inquiryWebhookUrl) — the
// processor uses `channel` to pick the right URL when revalidating against
// the current tenant config at dispatch time.
//
// Default 'main' so every existing row keeps its current semantics.
export class WebhookDeliveryChannel1776326000000 implements MigrationInterface {
  name = 'WebhookDeliveryChannel1776326000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE webhook_deliveries
       ADD COLUMN channel ENUM('main','inquiry') NOT NULL DEFAULT 'main'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE webhook_deliveries DROP COLUMN channel`,
    );
  }
}
