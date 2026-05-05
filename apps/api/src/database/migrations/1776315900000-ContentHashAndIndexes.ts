import { MigrationInterface, QueryRunner } from 'typeorm';

export class ContentHashAndIndexes1776315900000 implements MigrationInterface {
  name = 'ContentHashAndIndexes1776315900000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Content hash for feed change detection
    await queryRunner.query(
      `ALTER TABLE \`properties\` ADD \`contentHash\` varchar(64) NULL`,
    );

    // ── Missing FK indexes ──────────────────────────────────────
    // Lead FK indexes
    await queryRunner.query(
      `CREATE INDEX \`IDX_leads_contactId\` ON \`leads\` (\`contactId\`)`,
    );
    await queryRunner.query(
      `CREATE INDEX \`IDX_leads_propertyId\` ON \`leads\` (\`propertyId\`)`,
    );
    await queryRunner.query(
      `CREATE INDEX \`IDX_leads_wonPropertyId\` ON \`leads\` (\`wonPropertyId\`)`,
    );
    await queryRunner.query(
      `CREATE INDEX \`IDX_leads_userId\` ON \`leads\` (\`userId\`)`,
    );

    // Property FK indexes
    await queryRunner.query(
      `CREATE INDEX \`IDX_properties_agentId\` ON \`properties\` (\`agentId\`)`,
    );
    await queryRunner.query(
      `CREATE INDEX \`IDX_properties_salesAgentId\` ON \`properties\` (\`salesAgentId\`)`,
    );

    // Tenant FK indexes
    await queryRunner.query(
      `CREATE INDEX \`IDX_tenants_planId\` ON \`tenants\` (\`planId\`)`,
    );

    // Ticket FK indexes
    await queryRunner.query(
      `CREATE INDEX \`IDX_tickets_userId\` ON \`tickets\` (\`userId\`)`,
    );

    // Contact FK indexes
    await queryRunner.query(
      `CREATE INDEX \`IDX_contacts_sourcePropertyId\` ON \`contacts\` (\`sourcePropertyId\`)`,
    );

    // CreditTransaction FK indexes
    await queryRunner.query(
      `CREATE INDEX \`IDX_credit_transactions_ticketId\` ON \`credit_transactions\` (\`ticketId\`)`,
    );

    // SubscriptionPayment FK indexes
    await queryRunner.query(
      `CREATE INDEX \`IDX_subscription_payments_planId\` ON \`subscription_payments\` (\`planId\`)`,
    );

    // FeedImportLog FK indexes
    await queryRunner.query(
      `CREATE INDEX \`IDX_feed_import_logs_feedConfigId\` ON \`feed_import_logs\` (\`feedConfigId\`)`,
    );

    // RefreshToken FK indexes
    await queryRunner.query(
      `CREATE INDEX \`IDX_refresh_tokens_userId\` ON \`refresh_tokens\` (\`userId\`)`,
    );

    // MediaFile FK indexes
    await queryRunner.query(
      `CREATE INDEX \`IDX_media_files_propertyId\` ON \`media_files\` (\`propertyId\`)`,
    );

    // PropertyView FK indexes
    await queryRunner.query(
      `CREATE INDEX \`IDX_property_views_propertyId\` ON \`property_views\` (\`propertyId\`)`,
    );

    // ── Composite indexes for common query patterns ─────────────
    await queryRunner.query(
      `CREATE INDEX \`IDX_contacts_tenantId_subscribed\` ON \`contacts\` (\`tenantId\`, \`subscribed\`)`,
    );
    await queryRunner.query(
      `CREATE INDEX \`IDX_leads_tenantId_assignedTo\` ON \`leads\` (\`tenantId\`, \`assignedTo\`)`,
    );
    await queryRunner.query(
      `CREATE INDEX \`IDX_leads_tenantId_status_createdAt\` ON \`leads\` (\`tenantId\`, \`status\`, \`createdAt\`)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Composite indexes
    await queryRunner.query(`DROP INDEX \`IDX_leads_tenantId_status_createdAt\` ON \`leads\``);
    await queryRunner.query(`DROP INDEX \`IDX_leads_tenantId_assignedTo\` ON \`leads\``);
    await queryRunner.query(`DROP INDEX \`IDX_contacts_tenantId_subscribed\` ON \`contacts\``);

    // FK indexes
    await queryRunner.query(`DROP INDEX \`IDX_property_views_propertyId\` ON \`property_views\``);
    await queryRunner.query(`DROP INDEX \`IDX_media_files_propertyId\` ON \`media_files\``);
    await queryRunner.query(`DROP INDEX \`IDX_refresh_tokens_userId\` ON \`refresh_tokens\``);
    await queryRunner.query(`DROP INDEX \`IDX_feed_import_logs_feedConfigId\` ON \`feed_import_logs\``);
    await queryRunner.query(`DROP INDEX \`IDX_subscription_payments_planId\` ON \`subscription_payments\``);
    await queryRunner.query(`DROP INDEX \`IDX_credit_transactions_ticketId\` ON \`credit_transactions\``);
    await queryRunner.query(`DROP INDEX \`IDX_contacts_sourcePropertyId\` ON \`contacts\``);
    await queryRunner.query(`DROP INDEX \`IDX_tickets_userId\` ON \`tickets\``);
    await queryRunner.query(`DROP INDEX \`IDX_tenants_planId\` ON \`tenants\``);
    await queryRunner.query(`DROP INDEX \`IDX_properties_salesAgentId\` ON \`properties\``);
    await queryRunner.query(`DROP INDEX \`IDX_properties_agentId\` ON \`properties\``);
    await queryRunner.query(`DROP INDEX \`IDX_leads_userId\` ON \`leads\``);
    await queryRunner.query(`DROP INDEX \`IDX_leads_wonPropertyId\` ON \`leads\``);
    await queryRunner.query(`DROP INDEX \`IDX_leads_propertyId\` ON \`leads\``);
    await queryRunner.query(`DROP INDEX \`IDX_leads_contactId\` ON \`leads\``);

    // Content hash
    await queryRunner.query(`ALTER TABLE \`properties\` DROP COLUMN \`contentHash\``);
  }
}
