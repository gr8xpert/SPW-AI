import { MigrationInterface, QueryRunner } from 'typeorm';

// feed_configs.markAsFeatured: every property the feed imports is flagged
// isFeatured. properties.featuredByFeedId records which feed set the flag so
// that feed can clear it when the listing leaves its results.
//
// Backfill: feeds already named "...featured..." were set up as a featured
// list — switch the option on for them so the next sync flags their listings.
export class FeedMarkAsFeatured1777021000000 implements MigrationInterface {
  name = 'FeedMarkAsFeatured1777021000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('feed_configs', 'markAsFeatured'))) {
      await queryRunner.query(
        `ALTER TABLE feed_configs ADD COLUMN markAsFeatured TINYINT(1) NOT NULL DEFAULT 0`,
      );
      await queryRunner.query(
        `UPDATE feed_configs SET markAsFeatured = 1 WHERE LOWER(name) LIKE '%featured%'`,
      );
    }
    if (!(await queryRunner.hasColumn('properties', 'featuredByFeedId'))) {
      await queryRunner.query(`ALTER TABLE properties ADD COLUMN featuredByFeedId INT NULL`);
      await queryRunner.query(
        `ALTER TABLE properties ADD INDEX IDX_properties_featuredByFeedId (featuredByFeedId)`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE properties DROP INDEX IDX_properties_featuredByFeedId`);
    await queryRunner.query(`ALTER TABLE properties DROP COLUMN featuredByFeedId`);
    await queryRunner.query(`ALTER TABLE feed_configs DROP COLUMN markAsFeatured`);
  }
}
