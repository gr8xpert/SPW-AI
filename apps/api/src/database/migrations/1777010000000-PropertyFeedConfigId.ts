import { MigrationInterface, QueryRunner } from 'typeorm';

// Adds properties.feedConfigId so the per-feed "wipe imported data" button
// can identify which properties came from which feed. Previously we only
// stored `source` (the provider name), which is ambiguous when a tenant has
// multiple feeds with the same provider (e.g. two Resales agencies).
//
// FK is ON DELETE SET NULL so deleting a feed config doesn't cascade-delete
// its properties — the wipe endpoint handles data deletion explicitly and
// with a confirmation dialog.
//
// Backfill assigns existing properties to a feed_config when the mapping is
// unambiguous (tenant has exactly one feed with matching provider). Rows
// where the mapping is ambiguous (tenant has 2+ feeds with same provider)
// are left NULL — the operator can wipe them by hand or re-import.
export class PropertyFeedConfigId1777010000000 implements MigrationInterface {
  name = 'PropertyFeedConfigId1777010000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE properties ADD COLUMN feedConfigId INT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE properties ADD INDEX IDX_properties_feedConfigId (feedConfigId)`,
    );
    await queryRunner.query(
      `ALTER TABLE properties
         ADD CONSTRAINT FK_properties_feedConfigId
         FOREIGN KEY (feedConfigId) REFERENCES feed_configs(id) ON DELETE SET NULL`,
    );

    // Backfill: only when tenant has exactly one feed with the matching provider.
    // Multi-feed-same-provider tenants stay NULL — safer than guessing wrong.
    await queryRunner.query(`
      UPDATE properties p
      JOIN feed_configs fc
        ON fc.tenantId = p.tenantId
       AND fc.provider = p.source
      SET p.feedConfigId = fc.id
      WHERE p.source <> 'manual'
        AND (
          SELECT COUNT(*) FROM feed_configs fc2
           WHERE fc2.tenantId = p.tenantId
             AND fc2.provider = p.source
        ) = 1
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE properties DROP FOREIGN KEY FK_properties_feedConfigId`,
    );
    await queryRunner.query(
      `ALTER TABLE properties DROP INDEX IDX_properties_feedConfigId`,
    );
    await queryRunner.query(
      `ALTER TABLE properties DROP COLUMN feedConfigId`,
    );
  }
}
