import { MigrationInterface, QueryRunner } from 'typeorm';

// Buyer Match, milestone K: Facebook / Instagram lead forms. One connected
// Page per agency (token encrypted at rest), the lead ids already imported
// (never twice), and two lead sources.
const SOURCES_BEFORE = "'widget_inquiry','phone','email','walkin','referral','website','other'";
const SOURCES_AFTER = `${SOURCES_BEFORE},'facebook','instagram'`;

export class BuyerMatchMetaLeads1777310000000 implements MigrationInterface {
  name = 'BuyerMatchMetaLeads1777310000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE leads MODIFY COLUMN source ENUM(${SOURCES_AFTER}) NOT NULL DEFAULT 'widget_inquiry'`);

    if (!(await queryRunner.hasTable('meta_lead_sources'))) {
      await queryRunner.query(`
        CREATE TABLE meta_lead_sources (
          id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
          tenantId INT NOT NULL,
          pageId VARCHAR(30) NOT NULL,
          pageName VARCHAR(255) NULL,
          accessToken TEXT NULL,
          enabled TINYINT(1) NOT NULL DEFAULT 0,
          lastLeadAt DATETIME NULL,
          lastRunAt DATETIME NULL,
          lastError VARCHAR(500) NULL,
          imported INT NOT NULL DEFAULT 0,
          createdAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          updatedAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
          UNIQUE INDEX uq_meta_lead_sources_tenant (tenantId),
          CONSTRAINT FK_meta_lead_sources_tenant FOREIGN KEY (tenantId) REFERENCES tenants(id) ON DELETE CASCADE
        ) ENGINE=InnoDB`);
    }

    if (!(await queryRunner.hasTable('meta_leads'))) {
      await queryRunner.query(`
        CREATE TABLE meta_leads (
          leadgenId VARCHAR(40) NOT NULL PRIMARY KEY,
          tenantId INT NOT NULL,
          leadId INT NULL,
          createdAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          INDEX IDX_meta_leads_tenant (tenantId),
          CONSTRAINT FK_meta_leads_tenant FOREIGN KEY (tenantId) REFERENCES tenants(id) ON DELETE CASCADE,
          CONSTRAINT FK_meta_leads_lead FOREIGN KEY (leadId) REFERENCES leads(id) ON DELETE SET NULL
        ) ENGINE=InnoDB`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS meta_leads');
    await queryRunner.query('DROP TABLE IF EXISTS meta_lead_sources');
    await queryRunner.query("UPDATE leads SET source = 'other' WHERE source IN ('facebook','instagram')");
    await queryRunner.query(`ALTER TABLE leads MODIFY COLUMN source ENUM(${SOURCES_BEFORE}) NOT NULL DEFAULT 'widget_inquiry'`);
  }
}
