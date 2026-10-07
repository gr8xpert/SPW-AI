import { MigrationInterface, QueryRunner } from 'typeorm';

// New developments (Resales "New Developments API"):
//   - developmentName: Resales NewDevName ("Suite Mijas II")
//   - keyReady: ready to move into (Resales KeyReady)
//   - units: the price list of the development's units (Resales PriceList)
// Bathrooms become DECIMAL(4,1) so half baths (2.5) are kept.
export class DevelopmentUnits1777180000000 implements MigrationInterface {
  name = 'DevelopmentUnits1777180000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('properties', 'developmentName'))) {
      await queryRunner.query('ALTER TABLE properties ADD COLUMN developmentName VARCHAR(255) NULL');
    }
    if (!(await queryRunner.hasColumn('properties', 'keyReady'))) {
      await queryRunner.query('ALTER TABLE properties ADD COLUMN keyReady TINYINT(1) NULL');
    }
    if (!(await queryRunner.hasColumn('properties', 'units'))) {
      await queryRunner.query('ALTER TABLE properties ADD COLUMN units JSON NULL');
    }
    await queryRunner.query(
      'ALTER TABLE properties MODIFY bathrooms DECIMAL(4,1) NULL, MODIFY bathroomsTo DECIMAL(4,1) NULL',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE properties MODIFY bathrooms TINYINT UNSIGNED NULL, MODIFY bathroomsTo TINYINT UNSIGNED NULL',
    );
    await queryRunner.query('ALTER TABLE properties DROP COLUMN units, DROP COLUMN keyReady, DROP COLUMN developmentName');
  }
}
