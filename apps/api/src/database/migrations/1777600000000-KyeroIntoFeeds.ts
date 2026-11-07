import { MigrationInterface, QueryRunner } from 'typeorm';

// The built-in "Kyero XML" tab is gone: each client's Kyero XML feed becomes a
// row in Feed Export -> Feeds (title "Kyero"), keeping its key, so the URL
// portals already read (/api/feed/<slug>/properties.xml?key=sk_export_…)
// keeps working and now serves that row.
// - Only feeds in use move: switched on, or with hand-picked listings.
// - The feed's location/type filter moves to export_feeds.propertyFilter.
// - Past Kyero export log rows move to the new row's log.
// feed_export_configs keeps its columns: the JSON feed still falls back to exportKey.
export class KyeroIntoFeeds1777600000000 implements MigrationInterface {
  name = 'KyeroIntoFeeds1777600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('export_feeds', 'propertyFilter'))) {
      await queryRunner.query(`ALTER TABLE export_feeds ADD COLUMN propertyFilter JSON NULL`);
    }
    await queryRunner.query(`
      INSERT INTO export_feeds
        (tenantId, title, format, isEnabled, feedKey, includeUnpublished, listingScope,
         propertyIds, languages, propertyUrlPattern, propertyFilter, lastGeneratedAt)
      SELECT c.tenantId, 'Kyero', 'kyero',
             IF(c.isEnabled = 1 AND JSON_CONTAINS(COALESCE(c.allowedFormats, JSON_ARRAY('xml')), '"xml"'), 1, 0),
             c.exportKey, c.includeUnpublished, COALESCE(c.listingScope, 'all'),
             COALESCE(c.propertyIds, JSON_ARRAY()), JSON_ARRAY(), '', c.propertyFilter, c.lastGeneratedAt
      FROM feed_export_configs c
      WHERE (c.isEnabled = 1 OR COALESCE(JSON_LENGTH(c.propertyIds), 0) > 0)
        AND NOT EXISTS (SELECT 1 FROM export_feeds f WHERE f.feedKey = c.exportKey)
    `);
    await queryRunner.query(`
      UPDATE feed_export_logs l
      JOIN feed_export_configs c ON c.tenantId = l.tenantId
      JOIN export_feeds f ON f.feedKey = c.exportKey AND f.tenantId = c.tenantId
      SET l.exportFeedId = f.id
      WHERE l.format = 'xml' AND l.apiKeyId IS NULL AND l.exportFeedId IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE feed_export_logs l
      JOIN export_feeds f ON f.id = l.exportFeedId
      SET l.exportFeedId = NULL
      WHERE f.feedKey LIKE 'sk\\_export\\_%'
    `);
    await queryRunner.query(`DELETE FROM export_feeds WHERE feedKey LIKE 'sk\\_export\\_%'`);
    await queryRunner.query(`ALTER TABLE export_feeds DROP COLUMN propertyFilter`);
  }
}
