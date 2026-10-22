import { MigrationInterface, QueryRunner } from 'typeorm';

// Buyer Match, milestone I: trips (a buyer's visiting period) with their
// viewings, a per-user switch for the agent's daily email, and two activity
// types for viewings.
const BEFORE =
  "'note','call','email','sms','viewing','offer','meeting','status_change','assignment','enquiry','wishlist_form','task_done','suggestion_sent','import','merge','buyer_feedback','viewing_request','alert_sent'";
const AFTER = `${BEFORE},'viewing_planned','viewing_done'`;

export class BuyerMatchViewings1777290000000 implements MigrationInterface {
  name = 'BuyerMatchViewings1777290000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE lead_activities MODIFY COLUMN type ENUM(${AFTER}) NOT NULL`);

    if (!(await queryRunner.hasTable('buyer_trips'))) {
      await queryRunner.query(`
        CREATE TABLE buyer_trips (
          id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
          tenantId INT NOT NULL,
          leadId INT NOT NULL,
          startDate DATE NOT NULL,
          endDate DATE NOT NULL,
          notes TEXT NULL,
          createdBy INT NULL,
          createdAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          updatedAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
          INDEX IDX_buyer_trips_lead (leadId, startDate),
          INDEX IDX_buyer_trips_tenant (tenantId),
          CONSTRAINT FK_buyer_trips_tenant FOREIGN KEY (tenantId) REFERENCES tenants(id) ON DELETE CASCADE,
          CONSTRAINT FK_buyer_trips_lead FOREIGN KEY (leadId) REFERENCES leads(id) ON DELETE CASCADE,
          CONSTRAINT FK_buyer_trips_creator FOREIGN KEY (createdBy) REFERENCES users(id) ON DELETE SET NULL
        ) ENGINE=InnoDB`);
    }

    if (!(await queryRunner.hasTable('buyer_viewings'))) {
      await queryRunner.query(`
        CREATE TABLE buyer_viewings (
          id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
          tenantId INT NOT NULL,
          leadId INT NOT NULL,
          tripId INT NULL,
          propertyId INT NULL,
          title VARCHAR(255) NULL,
          startsAt DATETIME NOT NULL,
          durationMin SMALLINT NOT NULL DEFAULT 60,
          agentId INT NULL,
          meetingPoint VARCHAR(500) NULL,
          status ENUM('planned', 'done', 'cancelled', 'no_show') NOT NULL DEFAULT 'planned',
          feedback TEXT NULL,
          interest TINYINT NULL,
          reminderSentAt DATETIME NULL,
          createdBy INT NULL,
          createdAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          updatedAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
          INDEX idx_buyer_viewings_when (tenantId, startsAt),
          INDEX IDX_buyer_viewings_lead (leadId, startsAt),
          CONSTRAINT FK_buyer_viewings_tenant FOREIGN KEY (tenantId) REFERENCES tenants(id) ON DELETE CASCADE,
          CONSTRAINT FK_buyer_viewings_lead FOREIGN KEY (leadId) REFERENCES leads(id) ON DELETE CASCADE,
          CONSTRAINT FK_buyer_viewings_trip FOREIGN KEY (tripId) REFERENCES buyer_trips(id) ON DELETE SET NULL,
          CONSTRAINT FK_buyer_viewings_property FOREIGN KEY (propertyId) REFERENCES properties(id) ON DELETE SET NULL,
          CONSTRAINT FK_buyer_viewings_agent FOREIGN KEY (agentId) REFERENCES users(id) ON DELETE SET NULL,
          CONSTRAINT FK_buyer_viewings_creator FOREIGN KEY (createdBy) REFERENCES users(id) ON DELETE SET NULL
        ) ENGINE=InnoDB`);
    }

    if (!(await queryRunner.hasColumn('users', 'buyerDigest'))) {
      await queryRunner.query('ALTER TABLE users ADD COLUMN buyerDigest TINYINT(1) NOT NULL DEFAULT 1');
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasColumn('users', 'buyerDigest')) await queryRunner.query('ALTER TABLE users DROP COLUMN buyerDigest');
    await queryRunner.query('DROP TABLE IF EXISTS buyer_viewings');
    await queryRunner.query('DROP TABLE IF EXISTS buyer_trips');
    await queryRunner.query("DELETE FROM lead_activities WHERE type IN ('viewing_planned','viewing_done')");
    await queryRunner.query(`ALTER TABLE lead_activities MODIFY COLUMN type ENUM(${BEFORE}) NOT NULL`);
  }
}
