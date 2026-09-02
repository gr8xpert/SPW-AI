import { MigrationInterface, QueryRunner } from 'typeorm';

// Creates the xero_invoice_log table used to track Stripe → n8n → Xero
// invoice-sync attempts. Idempotent via IF NOT EXISTS.
export class XeroInvoiceLog1777002000000 implements MigrationInterface {
  name = 'XeroInvoiceLog1777002000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS xero_invoice_log (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenantId INT NOT NULL,
        stripeSessionId VARCHAR(128) NULL,
        status VARCHAR(16) NOT NULL,
        hours DECIMAL(10, 2) NOT NULL,
        amountEur DECIMAL(10, 2) NOT NULL,
        currency VARCHAR(8) NOT NULL,
        xeroInvoiceId VARCHAR(64) NULL,
        error VARCHAR(500) NULL,
        attempts INT NOT NULL DEFAULT 0,
        lastAttemptAt TIMESTAMP NULL,
        requestBody JSON NULL,
        createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_xero_log_status (status, createdAt),
        INDEX idx_xero_log_tenant (tenantId, createdAt),
        INDEX idx_xero_log_session (stripeSessionId)
      ) ENGINE=InnoDB
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS xero_invoice_log`);
  }
}
