import { MigrationInterface, QueryRunner } from 'typeorm';

// Adds the `aiTranslation` add-on flag to every tenant. Existing rows have
// their `dashboardAddons` JSON extended in-place with `aiTranslation: false`
// so the feature stays locked until a super-admin unlocks it per-client.
// The column DEFAULT is also updated via JSON_MERGE_PATCH-style handling in
// the entity's DEFAULT_DASHBOARD_ADDONS constant, so newly created tenants
// pick up the flag from the shared defaults.
export class AiTranslationAddon1776330000000 implements MigrationInterface {
  name = 'AiTranslationAddon1776330000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE tenants
         SET dashboardAddons = JSON_SET(
           COALESCE(dashboardAddons, JSON_OBJECT()),
           '$.aiTranslation', false
         )
       WHERE dashboardAddons IS NULL
          OR JSON_EXTRACT(dashboardAddons, '$.aiTranslation') IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE tenants
         SET dashboardAddons = JSON_REMOVE(dashboardAddons, '$.aiTranslation')
       WHERE dashboardAddons IS NOT NULL
         AND JSON_EXTRACT(dashboardAddons, '$.aiTranslation') IS NOT NULL`,
    );
  }
}
