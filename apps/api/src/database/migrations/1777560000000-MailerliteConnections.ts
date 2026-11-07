import { MigrationInterface, QueryRunner } from 'typeorm';

// 2026-11-05: a client's own MailerLite account, one row per tenant.
export class MailerliteConnections1777560000000 implements MigrationInterface {
  name = 'MailerliteConnections1777560000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('mailerlite_connections')) return;
    await queryRunner.query(`
      CREATE TABLE mailerlite_connections (
        id INT NOT NULL AUTO_INCREMENT,
        tenantId INT NOT NULL,
        apiKey TEXT NULL,
        webhookSecret TEXT NULL,
        hookToken VARCHAR(64) NULL,
        webhookId VARCHAR(64) NULL,
        groupMode VARCHAR(20) NOT NULL DEFAULT 'contacts_and_tags',
        groupIds JSON NULL,
        languageField VARCHAR(100) NULL,
        enabled TINYINT NOT NULL DEFAULT 0,
        consentAt DATETIME NULL,
        consentByUserId INT NULL,
        consentByEmail VARCHAR(255) NULL,
        state VARCHAR(20) NOT NULL DEFAULT 'idle',
        lastError VARCHAR(500) NULL,
        runStartedAt DATETIME(6) NULL,
        runSince DATETIME(6) NULL,
        runCursor INT NOT NULL DEFAULT 0,
        heartbeatAt DATETIME NULL,
        countAdded INT NOT NULL DEFAULT 0,
        countUpdated INT NOT NULL DEFAULT 0,
        countUnchanged INT NOT NULL DEFAULT 0,
        countSkipped INT NOT NULL DEFAULT 0,
        countFailed INT NOT NULL DEFAULT 0,
        lastSyncAt DATETIME NULL,
        lastSyncStartedAt DATETIME(6) NULL,
        lastFullSyncAt DATETIME(6) NULL,
        lastEventAt DATETIME NULL,
        createdAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updatedAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        UNIQUE INDEX uq_mailerlite_connections_tenant (tenantId),
        UNIQUE INDEX uq_mailerlite_connections_hook (hookToken),
        CONSTRAINT FK_mailerlite_connections_tenant FOREIGN KEY (tenantId) REFERENCES tenants(id) ON DELETE CASCADE
      ) ENGINE=InnoDB
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS mailerlite_connections');
  }
}
