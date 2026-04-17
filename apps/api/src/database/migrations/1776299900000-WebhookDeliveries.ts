import { MigrationInterface, QueryRunner } from 'typeorm';

export class WebhookDeliveries1776299900000 implements MigrationInterface {
  name = 'WebhookDeliveries1776299900000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE webhook_deliveries (
        id INT PRIMARY KEY AUTO_INCREMENT,
        tenantId INT NOT NULL,
        event VARCHAR(64) NOT NULL,
        targetUrl VARCHAR(500) NOT NULL,
        payload JSON NOT NULL,
        status ENUM('pending','delivered','failed','skipped') NOT NULL DEFAULT 'pending',
        attemptCount INT NOT NULL DEFAULT 0,
        lastStatusCode INT NULL,
        lastError TEXT NULL,
        deliveredAt TIMESTAMP NULL,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (tenantId) REFERENCES tenants(id) ON DELETE CASCADE,
        INDEX idx_webhook_tenant_created (tenantId, createdAt),
        INDEX idx_webhook_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE webhook_deliveries`);
  }
}
