import { MigrationInterface, QueryRunner } from 'typeorm';

// property_types.aliases: the client's "Other spellings" for a type. A feed
// sending any of these names puts its listings in this type, and picking a type
// with one of these names on the website also shows this type's listings.
export class PropertyTypeAliases1777510000000 implements MigrationInterface {
  name = 'PropertyTypeAliases1777510000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('property_types', 'aliases'))) {
      await queryRunner.query('ALTER TABLE property_types ADD COLUMN aliases JSON NULL');
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE property_types DROP COLUMN aliases');
  }
}
