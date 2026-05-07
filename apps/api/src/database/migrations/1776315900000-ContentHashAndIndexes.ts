import { MigrationInterface, QueryRunner } from 'typeorm';

export class ContentHashAndIndexes1776315900000 implements MigrationInterface {
  name = 'ContentHashAndIndexes1776315900000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`properties\` ADD COLUMN IF NOT EXISTS \`contentHash\` varchar(64) NULL`,
    );

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
      await queryRunner.query(
        `CREATE INDEX IF NOT EXISTS \`${name}\` ON \`${table}\` (\`${column}\`)`,
      );
    }

    // Composite indexes
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS \`IDX_contacts_tenantId_subscribed\` ON \`contacts\` (\`tenantId\`, \`subscribed\`)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS \`IDX_leads_tenantId_assignedTo\` ON \`leads\` (\`tenantId\`, \`assignedTo\`)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS \`IDX_leads_tenantId_status_createdAt\` ON \`leads\` (\`tenantId\`, \`status\`, \`createdAt\`)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS \`IDX_leads_tenantId_status_createdAt\` ON \`leads\``);
    await queryRunner.query(`DROP INDEX IF EXISTS \`IDX_leads_tenantId_assignedTo\` ON \`leads\``);
    await queryRunner.query(`DROP INDEX IF EXISTS \`IDX_contacts_tenantId_subscribed\` ON \`contacts\``);
    await queryRunner.query(`DROP INDEX IF EXISTS \`IDX_property_views_propertyId\` ON \`property_views\``);
    await queryRunner.query(`DROP INDEX IF EXISTS \`IDX_media_files_propertyId\` ON \`media_files\``);
    await queryRunner.query(`DROP INDEX IF EXISTS \`IDX_refresh_tokens_userId\` ON \`refresh_tokens\``);
    await queryRunner.query(`DROP INDEX IF EXISTS \`IDX_feed_import_logs_feedConfigId\` ON \`feed_import_logs\``);
    await queryRunner.query(`DROP INDEX IF EXISTS \`IDX_subscription_payments_planId\` ON \`subscription_payments\``);
    await queryRunner.query(`DROP INDEX IF EXISTS \`IDX_credit_transactions_ticketId\` ON \`credit_transactions\``);
    await queryRunner.query(`DROP INDEX IF EXISTS \`IDX_contacts_sourcePropertyId\` ON \`contacts\``);
    await queryRunner.query(`DROP INDEX IF EXISTS \`IDX_tickets_userId\` ON \`tickets\``);
    await queryRunner.query(`DROP INDEX IF EXISTS \`IDX_tenants_planId\` ON \`tenants\``);
    await queryRunner.query(`DROP INDEX IF EXISTS \`IDX_properties_salesAgentId\` ON \`properties\``);
    await queryRunner.query(`DROP INDEX IF EXISTS \`IDX_properties_agentId\` ON \`properties\``);
    await queryRunner.query(`DROP INDEX IF EXISTS \`IDX_leads_wonPropertyId\` ON \`leads\``);
    await queryRunner.query(`DROP INDEX IF EXISTS \`IDX_leads_propertyId\` ON \`leads\``);
    await queryRunner.query(`DROP INDEX IF EXISTS \`IDX_leads_contactId\` ON \`leads\``);
    await queryRunner.query(`ALTER TABLE \`properties\` DROP COLUMN IF EXISTS \`contentHash\``);
  }
}
