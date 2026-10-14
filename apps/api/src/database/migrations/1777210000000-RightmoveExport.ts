import { MigrationInterface, QueryRunner } from 'typeorm';

// Rightmove Overseas export (pushed through Rightmove's Real Time Datafeed):
// - feed_export_configs.rightmove: the client's settings (network/branch ID,
//   which listings, languages).
// - property_types.rightmoveType: the Rightmove type code each type is sent as.
// - locations.rightmoveLocationId: a hand-set link to Rightmove's place list.
// - rightmove_locations: Rightmove's place list (gazetteer), shared.
// - rightmove_listings: what was last sent per listing, so unchanged listings
//   are not sent again and removed ones are taken off.
// - rightmove_push_logs: one row per Rightmove call, for the dashboard.
export class RightmoveExport1777210000000 implements MigrationInterface {
  name = 'RightmoveExport1777210000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('feed_export_configs', 'rightmove'))) {
      await queryRunner.query('ALTER TABLE feed_export_configs ADD COLUMN rightmove JSON NULL');
    }
    if (!(await queryRunner.hasColumn('property_types', 'rightmoveType'))) {
      await queryRunner.query('ALTER TABLE property_types ADD COLUMN rightmoveType VARCHAR(8) NULL');
    }
    if (!(await queryRunner.hasColumn('locations', 'rightmoveLocationId'))) {
      await queryRunner.query('ALTER TABLE locations ADD COLUMN rightmoveLocationId INT NULL');
    }

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS rightmove_locations (
        id INT NOT NULL AUTO_INCREMENT,
        countryCode VARCHAR(2) NOT NULL DEFAULT 'ES',
        region VARCHAR(120) NOT NULL,
        subRegion VARCHAR(120) NULL,
        town VARCHAR(120) NULL,
        townKey VARCHAR(120) NOT NULL,
        PRIMARY KEY (id),
        INDEX IDX_rightmove_locations_country_town (countryCode, townKey)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS rightmove_listings (
        id INT NOT NULL AUTO_INCREMENT,
        tenantId INT NOT NULL,
        propertyId INT NULL,
        agentRef VARCHAR(80) NOT NULL,
        state VARCHAR(12) NOT NULL DEFAULT 'live',
        rightmoveId BIGINT NULL,
        rightmoveUrl VARCHAR(255) NULL,
        payloadHash VARCHAR(64) NULL,
        lastPushedAt TIMESTAMP NULL,
        lastError VARCHAR(1000) NULL,
        warnings JSON NULL,
        createdAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updatedAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        UNIQUE INDEX IDX_rightmove_listings_tenant_ref (tenantId, agentRef),
        CONSTRAINT FK_rightmove_listings_tenant FOREIGN KEY (tenantId) REFERENCES tenants(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS rightmove_push_logs (
        id INT NOT NULL AUTO_INCREMENT,
        tenantId INT NOT NULL,
        action VARCHAR(8) NOT NULL,
        agentRef VARCHAR(80) NULL,
        success TINYINT NOT NULL DEFAULT 0,
        dryRun TINYINT NOT NULL DEFAULT 0,
        message VARCHAR(1000) NULL,
        errors JSON NULL,
        warnings JSON NULL,
        responseTimeMs INT NULL,
        createdAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        INDEX IDX_rightmove_push_logs_tenant_created (tenantId, createdAt),
        CONSTRAINT FK_rightmove_push_logs_tenant FOREIGN KEY (tenantId) REFERENCES tenants(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS rightmove_push_logs');
    await queryRunner.query('DROP TABLE IF EXISTS rightmove_listings');
    await queryRunner.query('DROP TABLE IF EXISTS rightmove_locations');
    await queryRunner.query('ALTER TABLE locations DROP COLUMN rightmoveLocationId');
    await queryRunner.query('ALTER TABLE property_types DROP COLUMN rightmoveType');
    await queryRunner.query('ALTER TABLE feed_export_configs DROP COLUMN rightmove');
  }
}
