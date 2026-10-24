import { MigrationInterface, QueryRunner } from 'typeorm';

// Website sort to match Resales' dropdown (2026-10-24).
// - refNumber: the digits of the reference (R5524117 -> 5524117). Resales
//   hands out references in the order listings are created, so "Most Recently
//   Listed" there is the reference number going down. Our createdAt is the
//   moment the row was imported, so a bulk import came out in random order.
// - listedDay: the day the row arrived. Newest sort goes by day first, then
//   reference, so later arrivals and our own listings still go on top.
// - listingUpdatedAt: when the listing itself last changed (feed data/images
//   or an edit). updatedAt moves on every internal touch (featured flags,
//   AI SEO, translations), so "Most Up To Date" on it was meaningless.
// Generated columns: every insert/update path keeps them right by itself.
// NULLIF: MariaDB's REGEXP_SUBSTR gives '' (not NULL) on no match, and the
// {1,18} cap keeps a long digit run inside BIGINT.
export class PropertySortKeys1777430000000 implements MigrationInterface {
  name = 'PropertySortKeys1777430000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('properties', 'refNumber'))) {
      await queryRunner.query(
        "ALTER TABLE properties ADD COLUMN refNumber BIGINT UNSIGNED AS (CAST(NULLIF(REGEXP_SUBSTR(reference, '[0-9]{1,18}'), '') AS UNSIGNED)) STORED",
      );
    }
    if (!(await queryRunner.hasColumn('properties', 'listedDay'))) {
      await queryRunner.query('ALTER TABLE properties ADD COLUMN listedDay DATE AS (DATE(createdAt)) STORED');
    }
    if (!(await queryRunner.hasColumn('properties', 'listingUpdatedAt'))) {
      await queryRunner.query('ALTER TABLE properties ADD COLUMN listingUpdatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP');
      // Nothing better known for existing rows than when they arrived.
      await queryRunner.query('UPDATE properties SET listingUpdatedAt = createdAt');
    }
    const indexes = (await queryRunner.query('SHOW INDEX FROM properties')) as { Key_name: string }[];
    const has = (name: string) => indexes.some((i) => i.Key_name === name);
    if (!has('IDX_properties_sort_listed')) {
      await queryRunner.query('CREATE INDEX IDX_properties_sort_listed ON properties (tenantId, listedDay, refNumber)');
    }
    if (!has('IDX_properties_sort_updated')) {
      await queryRunner.query('CREATE INDEX IDX_properties_sort_updated ON properties (tenantId, listingUpdatedAt)');
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const indexes = (await queryRunner.query('SHOW INDEX FROM properties')) as { Key_name: string }[];
    const has = (name: string) => indexes.some((i) => i.Key_name === name);
    if (has('IDX_properties_sort_listed')) await queryRunner.query('DROP INDEX IDX_properties_sort_listed ON properties');
    if (has('IDX_properties_sort_updated')) await queryRunner.query('DROP INDEX IDX_properties_sort_updated ON properties');
    for (const col of ['listingUpdatedAt', 'listedDay', 'refNumber']) {
      if (await queryRunner.hasColumn('properties', col)) await queryRunner.query(`ALTER TABLE properties DROP COLUMN ${col}`);
    }
  }
}
