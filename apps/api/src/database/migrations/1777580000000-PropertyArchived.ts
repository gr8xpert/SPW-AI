import { MigrationInterface, QueryRunner } from 'typeorm';

// Archived properties: kept for later, never public.
// - properties.isArchived: set by hand or by a feed with markAsArchived; always
//   paired with isPublished=0.
// - properties.unarchivedByHand: a user took it out of the archive, so archive
//   feeds leave it alone.
// - feed_configs.markAsArchived: everything the feed imports comes in archived
//   (e.g. Odoo's archived listings exported as a separate Kyero feed).
export class PropertyArchived1777580000000 implements MigrationInterface {
  name = 'PropertyArchived1777580000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('properties', 'isArchived'))) {
      await queryRunner.query(`ALTER TABLE properties ADD COLUMN isArchived TINYINT(1) NOT NULL DEFAULT 0`);
      await queryRunner.query(`ALTER TABLE properties ADD INDEX IDX_properties_tenant_archived (tenantId, isArchived)`);
    }
    if (!(await queryRunner.hasColumn('properties', 'unarchivedByHand'))) {
      await queryRunner.query(`ALTER TABLE properties ADD COLUMN unarchivedByHand TINYINT(1) NOT NULL DEFAULT 0`);
    }
    if (!(await queryRunner.hasColumn('feed_configs', 'markAsArchived'))) {
      await queryRunner.query(`ALTER TABLE feed_configs ADD COLUMN markAsArchived TINYINT(1) NOT NULL DEFAULT 0`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE feed_configs DROP COLUMN markAsArchived`);
    await queryRunner.query(`ALTER TABLE properties DROP COLUMN unarchivedByHand`);
    await queryRunner.query(`ALTER TABLE properties DROP INDEX IDX_properties_tenant_archived`);
    await queryRunner.query(`ALTER TABLE properties DROP COLUMN isArchived`);
  }
}
