import { MigrationInterface, QueryRunner } from 'typeorm';

// V2 location hierarchy + AI enrichment scaffolding.
//
// 1. Re-defines location levels to match the canonical Spanish real-estate
//    hierarchy used in V1: Region > Province > Area > Municipality > Town >
//    Urbanization. The previous enum (country / province / municipality /
//    town / area) used the wrong names for what Resales actually sends.
// 2. Wipes existing locations and nulls property.locationId — the user
//    re-imports after this migration so the AI enrichment step can fill in
//    the right hierarchy from scratch. Cleaner than a fragile in-place
//    relabel.
// 3. Changes location slug uniqueness from (tenantId, slug) to
//    (tenantId, parentId, slug) so the same name can exist under different
//    parents (e.g. a "Centro" district in two different municipalities).
// 4. Adds `aiAssigned` boolean to locations, property_types, features so
//    the post-import enrichment can mark its own work and skip
//    user-overridden rows on re-runs.
// 5. Adds optional per-tenant `openrouterApiKey` so power-user clients can
//    use their own AI budget instead of the platform key.
export class LocationHierarchyAndAi1776323000000 implements MigrationInterface {
  name = 'LocationHierarchyAndAi1776323000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // --- 1. Wipe locations (FK-safe: null out properties first, then DELETE)
    await queryRunner.query(`UPDATE properties SET locationId = NULL WHERE locationId IS NOT NULL`);
    await queryRunner.query(`SET FOREIGN_KEY_CHECKS = 0`);
    await queryRunner.query(`DELETE FROM locations`);
    await queryRunner.query(`ALTER TABLE locations AUTO_INCREMENT = 1`);
    await queryRunner.query(`SET FOREIGN_KEY_CHECKS = 1`);

    // --- 2. Redefine level enum
    await queryRunner.query(
      `ALTER TABLE locations MODIFY COLUMN level
         ENUM('region','province','area','municipality','town','urbanization') NOT NULL`,
    );

    // --- 3. Swap unique index (tenantId, slug) → (tenantId, parentId, slug)
    // Old index name follows TypeORM auto-naming convention. Drop defensively
    // by querying INFORMATION_SCHEMA so this migration is idempotent.
    const oldIdx: { name: string }[] = await queryRunner.query(
      `SELECT INDEX_NAME AS name FROM INFORMATION_SCHEMA.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'locations'
         AND NON_UNIQUE = 0 AND INDEX_NAME <> 'PRIMARY'
       GROUP BY INDEX_NAME
       HAVING GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) = 'tenantId,slug'`,
    );
    for (const row of oldIdx) {
      await queryRunner.query(`DROP INDEX \`${row.name}\` ON locations`);
    }

    const newIdxExists: { c: number }[] = await queryRunner.query(
      `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'locations'
         AND INDEX_NAME = 'uq_locations_tenant_parent_slug'`,
    );
    if (Number(newIdxExists[0]?.c ?? 0) === 0) {
      await queryRunner.query(
        `CREATE UNIQUE INDEX uq_locations_tenant_parent_slug
           ON locations (tenantId, parentId, slug)`,
      );
    }

    // --- 4. Add aiAssigned to locations, property_types, features
    for (const table of ['locations', 'property_types', 'features']) {
      const exists: { c: number }[] = await queryRunner.query(
        `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
           AND COLUMN_NAME = 'aiAssigned'`,
        [table],
      );
      if (Number(exists[0]?.c ?? 0) === 0) {
        await queryRunner.query(
          `ALTER TABLE \`${table}\` ADD COLUMN aiAssigned TINYINT(1) NOT NULL DEFAULT 0`,
        );
      }
    }

    // --- 5. openrouterApiKey on tenants
    const orExists: { c: number }[] = await queryRunner.query(
      `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tenants'
         AND COLUMN_NAME = 'openrouterApiKey'`,
    );
    if (Number(orExists[0]?.c ?? 0) === 0) {
      // 500 chars — encrypted ciphertext (enc:v1: prefix + base64) for ~200-char raw keys.
      await queryRunner.query(
        `ALTER TABLE tenants ADD COLUMN openrouterApiKey VARCHAR(500) NULL`,
      );
    }

    // --- 6. Drop legacy locationSearchConfig from tenants.settings JSON.
    // The old config referenced level names (country/municipality/town/area)
    // that no longer exist post-rename. The dashboard falls back to the new
    // defaults when this key is missing.
    await queryRunner.query(
      `UPDATE tenants
         SET settings = JSON_REMOVE(settings, '$.locationSearchConfig')
       WHERE JSON_EXTRACT(settings, '$.locationSearchConfig') IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop new columns
    const orExists: { c: number }[] = await queryRunner.query(
      `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tenants'
         AND COLUMN_NAME = 'openrouterApiKey'`,
    );
    if (Number(orExists[0]?.c ?? 0) > 0) {
      await queryRunner.query(`ALTER TABLE tenants DROP COLUMN openrouterApiKey`);
    }

    for (const table of ['locations', 'property_types', 'features']) {
      const exists: { c: number }[] = await queryRunner.query(
        `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
           AND COLUMN_NAME = 'aiAssigned'`,
        [table],
      );
      if (Number(exists[0]?.c ?? 0) > 0) {
        await queryRunner.query(`ALTER TABLE \`${table}\` DROP COLUMN aiAssigned`);
      }
    }

    await queryRunner.query(`DROP INDEX uq_locations_tenant_parent_slug ON locations`).catch(() => {});

    // Revert enum — note: any rows using new-only values will fail. Since
    // up() wipes data, down() expects an empty table or compatible rows.
    await queryRunner.query(
      `ALTER TABLE locations MODIFY COLUMN level
         ENUM('country','province','municipality','town','area') NOT NULL`,
    );

    // Recreate the old single-column unique index
    await queryRunner.query(
      `CREATE UNIQUE INDEX IDX_locations_tenant_slug ON locations (tenantId, slug)`,
    ).catch(() => {});
  }
}
