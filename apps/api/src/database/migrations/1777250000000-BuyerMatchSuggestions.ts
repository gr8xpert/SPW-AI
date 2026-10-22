import { MigrationInterface, QueryRunner } from 'typeorm';

// Buyer Match, milestone B: the properties an agent picks for a buyer
// (Suggested tab), with a note, a virtual tour link, a visit date and how
// far each one got. One row per buyer and property.
export class BuyerMatchSuggestions1777250000000 implements MigrationInterface {
  name = 'BuyerMatchSuggestions1777250000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('lead_suggestions')) return;
    await queryRunner.query(`
      CREATE TABLE lead_suggestions (
        id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        tenantId INT NOT NULL,
        leadId INT NOT NULL,
        propertyId INT NOT NULL,
        note TEXT NULL,
        virtualTourUrl VARCHAR(500) NULL,
        visitDate DATETIME NULL,
        status ENUM('suggested', 'sent', 'visited', 'interested', 'not_interested') NOT NULL DEFAULT 'suggested',
        sentAt DATETIME NULL,
        createdBy INT NULL,
        createdAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updatedAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        UNIQUE INDEX uq_lead_suggestions (leadId, propertyId),
        INDEX IDX_lead_suggestions_tenant (tenantId),
        INDEX IDX_lead_suggestions_property (propertyId),
        CONSTRAINT FK_lead_suggestions_tenant FOREIGN KEY (tenantId) REFERENCES tenants(id) ON DELETE CASCADE,
        CONSTRAINT FK_lead_suggestions_lead FOREIGN KEY (leadId) REFERENCES leads(id) ON DELETE CASCADE,
        CONSTRAINT FK_lead_suggestions_property FOREIGN KEY (propertyId) REFERENCES properties(id) ON DELETE CASCADE,
        CONSTRAINT FK_lead_suggestions_creator FOREIGN KEY (createdBy) REFERENCES users(id) ON DELETE SET NULL
      ) ENGINE=InnoDB`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS lead_suggestions');
  }
}
