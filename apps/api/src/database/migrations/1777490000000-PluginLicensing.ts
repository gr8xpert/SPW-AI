import { MigrationInterface, QueryRunner } from 'typeorm';

// Licences for SPM's sellable WordPress plugins (2026-10-29): purchases from realtysoft.eu Stripe
// Payment Links, the sites each licence is activated on, and SPM AI credit usage per period.
export class PluginLicensing1777490000000 implements MigrationInterface {
  name = 'PluginLicensing1777490000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('plugin_licenses'))) {
      await queryRunner.query(`
        CREATE TABLE plugin_licenses (
          id INT NOT NULL AUTO_INCREMENT,
          product VARCHAR(50) NOT NULL DEFAULT 'spm-ai-translator',
          keyHash CHAR(64) NOT NULL,
          last4 CHAR(4) NOT NULL,
          plan VARCHAR(30) NOT NULL,
          sitesAllowed INT NOT NULL,
          wordsAllowed INT NULL,
          status VARCHAR(20) NOT NULL DEFAULT 'active',
          expiresAt TIMESTAMP NULL,
          creditsPeriodStart TIMESTAMP NULL,
          email VARCHAR(255) NOT NULL,
          customerName VARCHAR(255) NULL,
          stripeCustomerId VARCHAR(255) NULL,
          stripeSubscriptionId VARCHAR(255) NULL,
          stripeCheckoutSessionId VARCHAR(255) NULL,
          lastStripeEventAt INT NULL,
          createdAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          updatedAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
          PRIMARY KEY (id),
          UNIQUE INDEX uq_plugin_licenses_hash (keyHash),
          UNIQUE INDEX uq_plugin_licenses_subscription (stripeSubscriptionId),
          UNIQUE INDEX uq_plugin_licenses_session (stripeCheckoutSessionId),
          INDEX idx_plugin_licenses_email (email)
        ) ENGINE=InnoDB
      `);
    }
    if (!(await queryRunner.hasTable('plugin_activations'))) {
      await queryRunner.query(`
        CREATE TABLE plugin_activations (
          id INT NOT NULL AUTO_INCREMENT,
          licenseId INT NOT NULL,
          siteUrl VARCHAR(255) NOT NULL,
          pluginVersion VARCHAR(30) NULL,
          activatedAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          lastSeenAt TIMESTAMP NULL,
          PRIMARY KEY (id),
          UNIQUE INDEX uq_plugin_activations_site (licenseId, siteUrl),
          CONSTRAINT fk_plugin_activations_license FOREIGN KEY (licenseId) REFERENCES plugin_licenses (id) ON DELETE CASCADE
        ) ENGINE=InnoDB
      `);
    }
    if (!(await queryRunner.hasTable('plugin_credit_usage'))) {
      await queryRunner.query(`
        CREATE TABLE plugin_credit_usage (
          id INT NOT NULL AUTO_INCREMENT,
          licenseId INT NOT NULL,
          periodStart TIMESTAMP NOT NULL,
          wordsUsed INT NOT NULL DEFAULT 0,
          costMicros BIGINT NOT NULL DEFAULT 0,
          updatedAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
          PRIMARY KEY (id),
          UNIQUE INDEX uq_plugin_credit_usage_period (licenseId, periodStart),
          CONSTRAINT fk_plugin_credit_usage_license FOREIGN KEY (licenseId) REFERENCES plugin_licenses (id) ON DELETE CASCADE
        ) ENGINE=InnoDB
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS plugin_credit_usage');
    await queryRunner.query('DROP TABLE IF EXISTS plugin_activations');
    await queryRunner.query('DROP TABLE IF EXISTS plugin_licenses');
  }
}
