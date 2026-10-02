import { MigrationInterface, QueryRunner } from 'typeorm';

// Keeps a client's own arrangement through feed imports:
// - locations/property_types/features.feedKeys: which feed names (and merged
//   template places) a row stands for, wherever the client moved, renamed or
//   merged it — so the next import updates that row instead of creating a twin.
// - locations.aliases: the client's "Other spellings": searching any of these
//   names also shows this location's properties.
// - features.userLocked: the client chose this feature's category.
export class ClientLocationLinks1777140000000 implements MigrationInterface {
  name = 'ClientLocationLinks1777140000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const add = async (table: string, column: string, ddl: string) => {
      if (!(await queryRunner.hasColumn(table, column))) {
        await queryRunner.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
      }
    };
    await add('locations', 'aliases', 'JSON NULL');
    await add('locations', 'feedKeys', 'JSON NULL');
    await add('property_types', 'feedKeys', 'JSON NULL');
    await add('features', 'feedKeys', 'JSON NULL');
    await add('features', 'userLocked', 'TINYINT(1) NOT NULL DEFAULT 0');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE features DROP COLUMN userLocked');
    await queryRunner.query('ALTER TABLE features DROP COLUMN feedKeys');
    await queryRunner.query('ALTER TABLE property_types DROP COLUMN feedKeys');
    await queryRunner.query('ALTER TABLE locations DROP COLUMN feedKeys');
    await queryRunner.query('ALTER TABLE locations DROP COLUMN aliases');
  }
}
