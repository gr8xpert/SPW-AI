import { MigrationInterface, QueryRunner } from 'typeorm';

// 2026-11-05: the Kyero XML feed can send hand-picked listings. The JSON feed
// keeps its picks in its jsonFeed column, so only Kyero needs a new column.
export class FeedExportPickedListings1777550000000 implements MigrationInterface {
  name = 'FeedExportPickedListings1777550000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('feed_export_configs', 'propertyIds'))) {
      await queryRunner.query('ALTER TABLE feed_export_configs ADD COLUMN propertyIds JSON NULL');
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasColumn('feed_export_configs', 'propertyIds')) {
      await queryRunner.query('ALTER TABLE feed_export_configs DROP COLUMN propertyIds');
    }
  }
}
