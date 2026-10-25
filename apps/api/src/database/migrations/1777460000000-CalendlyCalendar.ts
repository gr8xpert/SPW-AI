import { MigrationInterface, QueryRunner } from 'typeorm';

// Calendly + calendar feeds (2026-10-25): the agency's Calendly connection,
// each agent's private .ics feed, the Calendly booking a viewing came from,
// and 'calendly' as a lead source. Enum lists are read from the table so a
// value added by a later migration elsewhere is never dropped.
async function addEnumValue(queryRunner: QueryRunner, table: string, column: string, value: string, tail: string): Promise<void> {
  const rows = (await queryRunner.query(
    'SELECT COLUMN_TYPE AS t FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?',
    [table, column],
  )) as { t: string }[];
  const type = rows[0]?.t;
  if (!type || !/^enum\(/i.test(type) || type.includes(`'${value}'`)) return;
  await queryRunner.query(`ALTER TABLE ${table} MODIFY COLUMN ${column} ${type.replace(/\)$/, `,'${value}')`)} ${tail}`);
}

export class CalendlyCalendar1777460000000 implements MigrationInterface {
  name = 'CalendlyCalendar1777460000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await addEnumValue(queryRunner, 'leads', 'source', 'calendly', "NOT NULL DEFAULT 'widget_inquiry'");

    if (!(await queryRunner.hasColumn('buyer_viewings', 'externalRef'))) {
      await queryRunner.query('ALTER TABLE buyer_viewings ADD COLUMN externalRef VARCHAR(255) NULL, ADD INDEX idx_buyer_viewings_external (tenantId, externalRef)');
    }

    if (!(await queryRunner.hasTable('calendly_connections'))) {
      await queryRunner.query(`
        CREATE TABLE calendly_connections (
          id INT NOT NULL AUTO_INCREMENT,
          tenantId INT NOT NULL,
          accessToken TEXT NOT NULL,
          signingKey TEXT NOT NULL,
          hookToken VARCHAR(64) NOT NULL,
          organizationUri VARCHAR(255) NOT NULL,
          ownerUri VARCHAR(255) NOT NULL,
          ownerEmail VARCHAR(255) NOT NULL,
          webhookUri VARCHAR(255) NULL,
          scope ENUM('organization','user') NOT NULL DEFAULT 'organization',
          members JSON NULL,
          lastEventAt DATETIME NULL,
          lastError VARCHAR(500) NULL,
          bookings INT NOT NULL DEFAULT 0,
          createdAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          updatedAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
          PRIMARY KEY (id),
          UNIQUE INDEX uq_calendly_connections_tenant (tenantId),
          UNIQUE INDEX uq_calendly_connections_hook (hookToken),
          CONSTRAINT FK_calendly_connections_tenant FOREIGN KEY (tenantId) REFERENCES tenants(id) ON DELETE CASCADE
        ) ENGINE=InnoDB
      `);
    }

    if (!(await queryRunner.hasTable('calendar_feeds'))) {
      await queryRunner.query(`
        CREATE TABLE calendar_feeds (
          userId INT NOT NULL,
          tenantId INT NOT NULL,
          token VARCHAR(64) NOT NULL,
          createdAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          PRIMARY KEY (userId),
          UNIQUE INDEX uq_calendar_feeds_token (token),
          CONSTRAINT FK_calendar_feeds_user FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
          CONSTRAINT FK_calendar_feeds_tenant FOREIGN KEY (tenantId) REFERENCES tenants(id) ON DELETE CASCADE
        ) ENGINE=InnoDB
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS calendar_feeds');
    await queryRunner.query('DROP TABLE IF EXISTS calendly_connections');
    if (await queryRunner.hasColumn('buyer_viewings', 'externalRef')) {
      await queryRunner.query('ALTER TABLE buyer_viewings DROP INDEX idx_buyer_viewings_external, DROP COLUMN externalRef');
    }
    await queryRunner.query("UPDATE leads SET source = 'other' WHERE source = 'calendly'");
    const rows = (await queryRunner.query(
      "SELECT COLUMN_TYPE AS t FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'leads' AND COLUMN_NAME = 'source'",
    )) as { t: string }[];
    const type = rows[0]?.t;
    if (type?.includes(",'calendly'")) {
      await queryRunner.query(`ALTER TABLE leads MODIFY COLUMN source ${type.replace(",'calendly'", '')} NOT NULL DEFAULT 'widget_inquiry'`);
    }
  }
}
