import { MigrationInterface, QueryRunner } from 'typeorm';

// MySQL 8 doesn't support `ADD COLUMN IF NOT EXISTS` or
// `CREATE INDEX IF NOT EXISTS` — those are PostgreSQL syntax. We
// emulate idempotency by checking INFORMATION_SCHEMA first so the
// migration is safe to re-run after partial application.
export class ContentHashAndIndexes1776315900000 implements MigrationInterface {
  name = 'ContentHashAndIndexes1776315900000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const columnExists = async (table: string, column: string): Promise<boolean> => {
      const rows: { c: number }[] = await queryRunner.query(
        `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
        [table, column],
      );
      return Number(rows[0]?.c ?? 0) > 0;
    };

    const indexExists = async (table: string, name: string): Promise<boolean> => {
      const rows: { c: number }[] = await queryRunner.query(
        `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.STATISTICS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
        [table, name],
      );
      return Number(rows[0]?.c ?? 0) > 0;
    };

    if (!(await columnExists('properties', 'contentHash'))) {
      await queryRunner.query(
        `ALTER TABLE \`properties\` ADD COLUMN \`contentHash\` varchar(64) NULL`,
      );
    }

    const indexes: [string, string, string][] = [
      ['IDX_leads_contactId', 'leads', 'contactId'],
      ['IDX_leads_propertyId', 'leads', 'propertyId'],
      ['IDX_leads_wonPropertyId', 'leads', 'wonPropertyId'],
      ['IDX_properties_agentId', 'properties', 'agentId'],
      ['IDX_properties_salesAgentId', 'properties', 'salesAgentId'],
      ['IDX_tenants_planId', 'tenants', 'planId'],
      ['IDX_tickets_userId', 'tickets', 'userId'],
      ['IDX_contacts_sourcePropertyId', 'contacts', 'sourcePropertyId'],
      ['IDX_credit_transactions_ticketId', 'credit_transactions', 'ticketId'],
      ['IDX_subscription_payments_planId', 'subscription_payments', 'planId'],
      ['IDX_feed_import_logs_feedConfigId', 'feed_import_logs', 'feedConfigId'],
      ['IDX_refresh_tokens_userId', 'refresh_tokens', 'userId'],
      ['IDX_media_files_propertyId', 'media_files', 'propertyId'],
      ['IDX_property_views_propertyId', 'property_views', 'propertyId'],
    ];

    for (const [name, table, column] of indexes) {
      if (!(await indexExists(table, name))) {
        await queryRunner.query(
          `CREATE INDEX \`${name}\` ON \`${table}\` (\`${column}\`)`,
        );
      }
    }

    const composites: [string, string, string][] = [
      ['IDX_contacts_tenantId_subscribed', 'contacts', '`tenantId`, `subscribed`'],
      ['IDX_leads_tenantId_assignedTo', 'leads', '`tenantId`, `assignedTo`'],
      ['IDX_leads_tenantId_status_createdAt', 'leads', '`tenantId`, `status`, `createdAt`'],
    ];
    for (const [name, table, cols] of composites) {
      if (!(await indexExists(table, name))) {
        await queryRunner.query(`CREATE INDEX \`${name}\` ON \`${table}\` (${cols})`);
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const indexExists = async (table: string, name: string): Promise<boolean> => {
      const rows: { c: number }[] = await queryRunner.query(
        `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.STATISTICS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
        [table, name],
      );
      return Number(rows[0]?.c ?? 0) > 0;
    };

    const drops: [string, string][] = [
      ['IDX_leads_tenantId_status_createdAt', 'leads'],
      ['IDX_leads_tenantId_assignedTo', 'leads'],
      ['IDX_contacts_tenantId_subscribed', 'contacts'],
      ['IDX_property_views_propertyId', 'property_views'],
      ['IDX_media_files_propertyId', 'media_files'],
      ['IDX_refresh_tokens_userId', 'refresh_tokens'],
      ['IDX_feed_import_logs_feedConfigId', 'feed_import_logs'],
      ['IDX_subscription_payments_planId', 'subscription_payments'],
      ['IDX_credit_transactions_ticketId', 'credit_transactions'],
      ['IDX_contacts_sourcePropertyId', 'contacts'],
      ['IDX_tickets_userId', 'tickets'],
      ['IDX_tenants_planId', 'tenants'],
      ['IDX_properties_salesAgentId', 'properties'],
      ['IDX_properties_agentId', 'properties'],
      ['IDX_leads_wonPropertyId', 'leads'],
      ['IDX_leads_propertyId', 'leads'],
      ['IDX_leads_contactId', 'leads'],
    ];
    for (const [name, table] of drops) {
      if (await indexExists(table, name)) {
        await queryRunner.query(`DROP INDEX \`${name}\` ON \`${table}\``);
      }
    }

    const colExists: { c: number }[] = await queryRunner.query(
      `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'properties' AND COLUMN_NAME = 'contentHash'`,
    );
    if (Number(colExists[0]?.c ?? 0) > 0) {
      await queryRunner.query(`ALTER TABLE \`properties\` DROP COLUMN \`contentHash\``);
    }
  }
}
