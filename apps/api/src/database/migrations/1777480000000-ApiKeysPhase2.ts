import { MigrationInterface, QueryRunner } from 'typeorm';

// Website keys, phases 2 and 3 (2026-10-28): a key's allowed domains and its
// own display/form settings, and which key a lead, a view, a search and a
// site check-in came in on (null = the client's main key). Nullable columns
// only, so existing rows and the main key are untouched.
const KEY_COLUMNS: Array<[string, string]> = [
  ['leads', 'apiKeyId'],
  ['property_views', 'apiKeyId'],
  ['search_logs', 'apiKeyId'],
  ['site_checkins', 'apiKeyId'],
];

export class ApiKeysPhase21777480000000 implements MigrationInterface {
  name = 'ApiKeysPhase21777480000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('api_keys', 'allowedDomains'))) {
      await queryRunner.query('ALTER TABLE api_keys ADD COLUMN allowedDomains JSON NULL, ADD COLUMN settings JSON NULL');
    }
    for (const [table, column] of KEY_COLUMNS) {
      if (!(await queryRunner.hasColumn(table, column))) {
        await queryRunner.query(`ALTER TABLE ${table} ADD COLUMN ${column} INT NULL`);
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const [table, column] of KEY_COLUMNS) {
      if (await queryRunner.hasColumn(table, column)) await queryRunner.query(`ALTER TABLE ${table} DROP COLUMN ${column}`);
    }
    if (await queryRunner.hasColumn('api_keys', 'allowedDomains')) {
      await queryRunner.query('ALTER TABLE api_keys DROP COLUMN allowedDomains, DROP COLUMN settings');
    }
  }
}
