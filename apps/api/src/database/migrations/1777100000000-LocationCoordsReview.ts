import { MigrationInterface, QueryRunner } from 'typeorm';

// location_template_nodes.coordsIssue: why a place's coordinates were refused
// (swapped, outside Spain, far from the rest of its municipality). The value is
// cleared so no client's map uses it; the reason stays until someone enters a
// correct one. coordsConfirmed: a person entered or accepted the point, so the
// distance check never refuses it again.
//
// locations.coordsLocked: the client typed this place's coordinates in their
// dashboard, so the template's value never replaces them.
export class LocationCoordsReview1777100000000 implements MigrationInterface {
  name = 'LocationCoordsReview1777100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const has = async (table: string, column: string) => {
      const rows = await queryRunner.query(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
        [table, column],
      );
      return Array.isArray(rows) && rows.length > 0;
    };
    if (!(await has('location_template_nodes', 'coordsIssue'))) {
      await queryRunner.query('ALTER TABLE location_template_nodes ADD COLUMN coordsIssue VARCHAR(300) NULL');
    }
    if (!(await has('location_template_nodes', 'coordsConfirmed'))) {
      await queryRunner.query('ALTER TABLE location_template_nodes ADD COLUMN coordsConfirmed TINYINT NOT NULL DEFAULT 0');
    }
    if (!(await has('locations', 'coordsLocked'))) {
      await queryRunner.query('ALTER TABLE locations ADD COLUMN coordsLocked TINYINT NOT NULL DEFAULT 0');
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE location_template_nodes DROP COLUMN coordsIssue');
    await queryRunner.query('ALTER TABLE location_template_nodes DROP COLUMN coordsConfirmed');
    await queryRunner.query('ALTER TABLE locations DROP COLUMN coordsLocked');
  }
}
