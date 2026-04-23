import { MigrationInterface, QueryRunner } from 'typeorm';

export class PropertyExtendedFields1776306900000 implements MigrationInterface {
  name = 'PropertyExtendedFields1776306900000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE properties
        -- Address
        ADD COLUMN floor VARCHAR(50) NULL,
        ADD COLUMN street VARCHAR(255) NULL,
        ADD COLUMN streetNumber VARCHAR(50) NULL,
        ADD COLUMN postcode VARCHAR(20) NULL,
        ADD COLUMN cadastralReference VARCHAR(100) NULL,
        -- Size
        ADD COLUMN solariumSize DECIMAL(10,2) NULL,
        -- Financial
        ADD COLUMN communityFees DECIMAL(10,2) NULL,
        ADD COLUMN basuraTax DECIMAL(10,2) NULL,
        ADD COLUMN ibiFees DECIMAL(10,2) NULL,
        ADD COLUMN commission DECIMAL(5,2) NULL,
        ADD COLUMN sharedCommission TINYINT NOT NULL DEFAULT 0,
        -- Building / Energy
        ADD COLUMN builtYear SMALLINT UNSIGNED NULL,
        ADD COLUMN energyConsumption DECIMAL(10,2) NULL,
        -- Distance
        ADD COLUMN distanceToBeach DECIMAL(10,2) NULL,
        -- URLs
        ADD COLUMN externalLink VARCHAR(500) NULL,
        ADD COLUMN blogUrl VARCHAR(500) NULL,
        ADD COLUMN mapLink VARCHAR(500) NULL,
        ADD COLUMN websiteUrl VARCHAR(500) NULL,
        -- SEO
        ADD COLUMN slug VARCHAR(255) NULL,
        ADD COLUMN metaTitle JSON NULL,
        ADD COLUMN metaDescription JSON NULL,
        ADD COLUMN metaKeywords JSON NULL,
        ADD COLUMN pageTitle JSON NULL,
        -- Agent / Assignment
        ADD COLUMN agentId INT NULL,
        ADD COLUMN salesAgentId INT NULL,
        ADD COLUMN project VARCHAR(255) NULL,
        -- Selection flags
        ADD COLUMN isOwnProperty TINYINT NOT NULL DEFAULT 0,
        ADD COLUMN villaSelection TINYINT NOT NULL DEFAULT 0,
        ADD COLUMN luxurySelection TINYINT NOT NULL DEFAULT 0,
        ADD COLUMN apartmentSelection TINYINT NOT NULL DEFAULT 0,
        -- Dates / Audit
        ADD COLUMN completionDate DATE NULL,
        ADD COLUMN lastUpdatedResales TIMESTAMP NULL,
        ADD COLUMN lastUpdatedById INT NULL,
        ADD COLUMN propertyTypeReference VARCHAR(100) NULL,
        -- Geo
        ADD COLUMN geoLocationLabel VARCHAR(255) NULL
    `);

    await queryRunner.query(`
      ALTER TABLE properties
        ADD CONSTRAINT FK_properties_agentId
          FOREIGN KEY (agentId) REFERENCES users(id) ON DELETE SET NULL,
        ADD CONSTRAINT FK_properties_salesAgentId
          FOREIGN KEY (salesAgentId) REFERENCES users(id) ON DELETE SET NULL,
        ADD CONSTRAINT FK_properties_lastUpdatedById
          FOREIGN KEY (lastUpdatedById) REFERENCES users(id) ON DELETE SET NULL
    `);

    await queryRunner.query(
      `CREATE UNIQUE INDEX IDX_properties_tenant_slug ON properties (tenantId, slug)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IDX_properties_tenant_slug ON properties`);

    await queryRunner.query(`
      ALTER TABLE properties
        DROP FOREIGN KEY FK_properties_agentId,
        DROP FOREIGN KEY FK_properties_salesAgentId,
        DROP FOREIGN KEY FK_properties_lastUpdatedById
    `);

    await queryRunner.query(`
      ALTER TABLE properties
        DROP COLUMN geoLocationLabel,
        DROP COLUMN propertyTypeReference,
        DROP COLUMN lastUpdatedById,
        DROP COLUMN lastUpdatedResales,
        DROP COLUMN completionDate,
        DROP COLUMN apartmentSelection,
        DROP COLUMN luxurySelection,
        DROP COLUMN villaSelection,
        DROP COLUMN isOwnProperty,
        DROP COLUMN project,
        DROP COLUMN salesAgentId,
        DROP COLUMN agentId,
        DROP COLUMN pageTitle,
        DROP COLUMN metaKeywords,
        DROP COLUMN metaDescription,
        DROP COLUMN metaTitle,
        DROP COLUMN slug,
        DROP COLUMN websiteUrl,
        DROP COLUMN mapLink,
        DROP COLUMN blogUrl,
        DROP COLUMN externalLink,
        DROP COLUMN distanceToBeach,
        DROP COLUMN energyConsumption,
        DROP COLUMN builtYear,
        DROP COLUMN sharedCommission,
        DROP COLUMN commission,
        DROP COLUMN ibiFees,
        DROP COLUMN basuraTax,
        DROP COLUMN communityFees,
        DROP COLUMN solariumSize,
        DROP COLUMN cadastralReference,
        DROP COLUMN postcode,
        DROP COLUMN streetNumber,
        DROP COLUMN street,
        DROP COLUMN floor
    `);
  }
}
