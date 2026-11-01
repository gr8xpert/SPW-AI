import { MigrationInterface, QueryRunner } from 'typeorm';

// A website key's own XML feed (2026-11-01): the same listings the key shows
// on a website, as a Kyero v3 XML URL for another portal or CRM. The token is
// separate from the website key (portals fetch from their own servers, so a
// domain-locked key would not work there). Null = this key has no feed.
export class ApiKeyFeed1777500000000 implements MigrationInterface {
  name = 'ApiKeyFeed1777500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasColumn('api_keys', 'feedKey')) return;
    await queryRunner.query(
      'ALTER TABLE api_keys ADD COLUMN feedKey VARCHAR(64) NULL, ADD COLUMN feedLastUsedAt TIMESTAMP NULL, ADD UNIQUE INDEX uq_api_keys_feed_key (feedKey)',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('api_keys', 'feedKey'))) return;
    await queryRunner.query('ALTER TABLE api_keys DROP INDEX uq_api_keys_feed_key, DROP COLUMN feedKey, DROP COLUMN feedLastUsedAt');
  }
}
