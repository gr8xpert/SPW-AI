import { MigrationInterface, QueryRunner } from 'typeorm';

// location_template_unmatched.resolution: what sorting an unknown feed place
// name changed (alias added, town created, dismissed), so Super Admin can undo
// exactly that.
export class UnmatchedResolution1777120000000 implements MigrationInterface {
  name = 'UnmatchedResolution1777120000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const rows = await queryRunner.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'location_template_unmatched' AND COLUMN_NAME = 'resolution'`,
    );
    if (!Array.isArray(rows) || rows.length === 0) {
      await queryRunner.query('ALTER TABLE location_template_unmatched ADD COLUMN resolution JSON NULL');
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE location_template_unmatched DROP COLUMN resolution');
  }
}
