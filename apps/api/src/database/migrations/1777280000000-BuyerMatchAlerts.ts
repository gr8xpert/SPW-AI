import { MigrationInterface, QueryRunner } from 'typeorm';

// Buyer Match, milestone H: new-listing and price-drop alerts. Alerts wait
// for the agent's approval; the scanner remembers the last price it saw of
// each listing; the daily digest is claimed once per agency and day.
export class BuyerMatchAlerts1777280000000 implements MigrationInterface {
  name = 'BuyerMatchAlerts1777280000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('buyer_alerts'))) {
      await queryRunner.query(`
        CREATE TABLE buyer_alerts (
          id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
          tenantId INT NOT NULL,
          leadId INT NOT NULL,
          propertyId INT NOT NULL,
          kind ENUM('new_listing', 'price_drop') NOT NULL,
          oldPrice DECIMAL(15,2) NULL,
          newPrice DECIMAL(15,2) NULL,
          score INT NOT NULL DEFAULT 0,
          status ENUM('pending', 'approved', 'rejected', 'sent', 'skipped') NOT NULL DEFAULT 'pending',
          dedupeKey VARCHAR(80) NOT NULL,
          decidedBy INT NULL,
          decidedAt DATETIME NULL,
          sentAt DATETIME NULL,
          sendId INT NULL,
          createdAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          updatedAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
          UNIQUE INDEX uq_buyer_alerts_dedupe (tenantId, dedupeKey),
          INDEX idx_buyer_alerts_status (tenantId, status, id),
          INDEX IDX_buyer_alerts_lead (leadId),
          CONSTRAINT FK_buyer_alerts_tenant FOREIGN KEY (tenantId) REFERENCES tenants(id) ON DELETE CASCADE,
          CONSTRAINT FK_buyer_alerts_lead FOREIGN KEY (leadId) REFERENCES leads(id) ON DELETE CASCADE,
          CONSTRAINT FK_buyer_alerts_property FOREIGN KEY (propertyId) REFERENCES properties(id) ON DELETE CASCADE,
          CONSTRAINT FK_buyer_alerts_decider FOREIGN KEY (decidedBy) REFERENCES users(id) ON DELETE SET NULL,
          CONSTRAINT FK_buyer_alerts_send FOREIGN KEY (sendId) REFERENCES buyer_sends(id) ON DELETE SET NULL
        ) ENGINE=InnoDB`);
    }
    if (!(await queryRunner.hasTable('buyer_alert_prices'))) {
      await queryRunner.query(`
        CREATE TABLE buyer_alert_prices (
          propertyId INT NOT NULL PRIMARY KEY,
          tenantId INT NOT NULL,
          price DECIMAL(15,2) NULL,
          seenAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          INDEX IDX_buyer_alert_prices_tenant (tenantId),
          CONSTRAINT FK_buyer_alert_prices_property FOREIGN KEY (propertyId) REFERENCES properties(id) ON DELETE CASCADE,
          CONSTRAINT FK_buyer_alert_prices_tenant FOREIGN KEY (tenantId) REFERENCES tenants(id) ON DELETE CASCADE
        ) ENGINE=InnoDB`);
    }
    if (!(await queryRunner.hasTable('buyer_alert_runs'))) {
      await queryRunner.query(`
        CREATE TABLE buyer_alert_runs (
          tenantId INT NOT NULL,
          kind VARCHAR(20) NOT NULL,
          day DATE NOT NULL,
          createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (tenantId, kind, day),
          CONSTRAINT FK_buyer_alert_runs_tenant FOREIGN KEY (tenantId) REFERENCES tenants(id) ON DELETE CASCADE
        ) ENGINE=InnoDB`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS buyer_alert_runs');
    await queryRunner.query('DROP TABLE IF EXISTS buyer_alert_prices');
    await queryRunner.query('DROP TABLE IF EXISTS buyer_alerts');
  }
}
