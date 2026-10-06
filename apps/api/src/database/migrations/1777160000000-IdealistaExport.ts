import { MigrationInterface, QueryRunner } from 'typeorm';

// idealista feed export (customer JSON v6):
// - feed_export_configs.idealista: the client's idealista settings (customer
//   code, contact, which listings, address visibility, page URL pattern).
// - property_types.idealistaType: the idealista type each of the client's
//   property types is exported as. NULL = parent's, else guessed from the name.
export class IdealistaExport1777160000000 implements MigrationInterface {
  name = 'IdealistaExport1777160000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('feed_export_configs', 'idealista'))) {
      await queryRunner.query('ALTER TABLE feed_export_configs ADD COLUMN idealista JSON NULL');
    }
    if (!(await queryRunner.hasColumn('property_types', 'idealistaType'))) {
      await queryRunner.query('ALTER TABLE property_types ADD COLUMN idealistaType VARCHAR(40) NULL');
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE property_types DROP COLUMN idealistaType');
    await queryRunner.query('ALTER TABLE feed_export_configs DROP COLUMN idealista');
  }
}
