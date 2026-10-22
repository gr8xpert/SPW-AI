import { MigrationInterface, QueryRunner } from 'typeorm';

// Buyer Match, milestone E: what happened to each property sent to a buyer
// (opened, clicked, liked / rejected, viewing, offer), the emails that were
// sent (their ids sign the tracking links), and the change log of buyers.
const SUGGESTION_COLUMNS: [string, string][] = [
  ['openedAt', 'DATETIME NULL'],
  ['clickedAt', 'DATETIME NULL'],
  ['likedAt', 'DATETIME NULL'],
  ['rejectedAt', 'DATETIME NULL'],
  ['rejectReason', 'VARCHAR(255) NULL'],
  ['viewingAt', 'DATETIME NULL'],
  ['offerAt', 'DATETIME NULL'],
];

// Activity types for the whole of Phase 2 (buyer page feedback, viewing
// requests, alerts), added once here.
const P1_ACTIVITY_TYPES =
  "'note','call','email','sms','viewing','offer','meeting','status_change','assignment','enquiry','wishlist_form','task_done','suggestion_sent','import','merge'";
const P2_ACTIVITY_TYPES = `${P1_ACTIVITY_TYPES},'buyer_feedback','viewing_request','alert_sent'`;

export class BuyerMatchTracking1777260000000 implements MigrationInterface {
  name = 'BuyerMatchTracking1777260000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE lead_activities MODIFY COLUMN type ENUM(${P2_ACTIVITY_TYPES}) NOT NULL`);

    for (const [name, type] of SUGGESTION_COLUMNS) {
      if (!(await queryRunner.hasColumn('lead_suggestions', name))) {
        await queryRunner.query(`ALTER TABLE lead_suggestions ADD COLUMN ${name} ${type}`);
      }
    }

    if (!(await queryRunner.hasTable('buyer_sends'))) {
      await queryRunner.query(`
        CREATE TABLE buyer_sends (
          id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
          tenantId INT NOT NULL,
          leadId INT NOT NULL,
          recipient ENUM('buyer', 'agent') NOT NULL,
          kind ENUM('selection', 'alert') NOT NULL DEFAULT 'selection',
          propertyIds JSON NOT NULL,
          lang VARCHAR(5) NOT NULL DEFAULT 'en',
          createdBy INT NULL,
          openedAt DATETIME NULL,
          clickedAt DATETIME NULL,
          createdAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          INDEX IDX_buyer_sends_lead (leadId, id),
          INDEX IDX_buyer_sends_tenant (tenantId),
          CONSTRAINT FK_buyer_sends_tenant FOREIGN KEY (tenantId) REFERENCES tenants(id) ON DELETE CASCADE,
          CONSTRAINT FK_buyer_sends_lead FOREIGN KEY (leadId) REFERENCES leads(id) ON DELETE CASCADE,
          CONSTRAINT FK_buyer_sends_creator FOREIGN KEY (createdBy) REFERENCES users(id) ON DELETE SET NULL
        ) ENGINE=InnoDB`);
    }

    if (!(await queryRunner.hasTable('lead_suggestion_events'))) {
      await queryRunner.query(`
        CREATE TABLE lead_suggestion_events (
          id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
          tenantId INT NOT NULL,
          leadId INT NOT NULL,
          propertyId INT NOT NULL,
          sendId INT NULL,
          event ENUM('sent', 'opened', 'clicked', 'liked', 'rejected', 'cleared', 'viewing', 'offer') NOT NULL,
          source ENUM('email', 'page', 'agent', 'alert') NOT NULL,
          userId INT NULL,
          note VARCHAR(500) NULL,
          createdAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          INDEX IDX_lead_suggestion_events_lead (leadId, propertyId, id),
          INDEX IDX_lead_suggestion_events_tenant (tenantId),
          CONSTRAINT FK_lse_tenant FOREIGN KEY (tenantId) REFERENCES tenants(id) ON DELETE CASCADE,
          CONSTRAINT FK_lse_lead FOREIGN KEY (leadId) REFERENCES leads(id) ON DELETE CASCADE,
          CONSTRAINT FK_lse_property FOREIGN KEY (propertyId) REFERENCES properties(id) ON DELETE CASCADE,
          CONSTRAINT FK_lse_send FOREIGN KEY (sendId) REFERENCES buyer_sends(id) ON DELETE SET NULL,
          CONSTRAINT FK_lse_user FOREIGN KEY (userId) REFERENCES users(id) ON DELETE SET NULL
        ) ENGINE=InnoDB`);
    }

    if (!(await queryRunner.hasTable('lead_changes'))) {
      await queryRunner.query(`
        CREATE TABLE lead_changes (
          id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
          tenantId INT NOT NULL,
          leadId INT NOT NULL,
          userId INT NULL,
          source ENUM('dashboard', 'website', 'import', 'system') NOT NULL,
          changes JSON NOT NULL,
          createdAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          INDEX IDX_lead_changes_lead (leadId, id),
          INDEX IDX_lead_changes_tenant (tenantId),
          CONSTRAINT FK_lead_changes_tenant FOREIGN KEY (tenantId) REFERENCES tenants(id) ON DELETE CASCADE,
          CONSTRAINT FK_lead_changes_lead FOREIGN KEY (leadId) REFERENCES leads(id) ON DELETE CASCADE,
          CONSTRAINT FK_lead_changes_user FOREIGN KEY (userId) REFERENCES users(id) ON DELETE SET NULL
        ) ENGINE=InnoDB`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS lead_changes');
    await queryRunner.query('DROP TABLE IF EXISTS lead_suggestion_events');
    await queryRunner.query('DROP TABLE IF EXISTS buyer_sends');
    for (const [name] of SUGGESTION_COLUMNS) {
      if (await queryRunner.hasColumn('lead_suggestions', name)) {
        await queryRunner.query(`ALTER TABLE lead_suggestions DROP COLUMN ${name}`);
      }
    }
    await queryRunner.query("DELETE FROM lead_activities WHERE type IN ('buyer_feedback','viewing_request','alert_sent')");
    await queryRunner.query(`ALTER TABLE lead_activities MODIFY COLUMN type ENUM(${P1_ACTIVITY_TYPES}) NOT NULL`);
  }
}
