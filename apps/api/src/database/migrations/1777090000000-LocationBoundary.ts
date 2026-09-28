import { MigrationInterface, QueryRunner } from 'typeorm';

// locations.boundary: the outline of a town or area as GeoJSON. Feed listings
// have no coordinates of their own, so the map draws the place they are in
// instead of a pin it would have to invent.
export class LocationBoundary1777090000000 implements MigrationInterface {
  name = 'LocationBoundary1777090000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const columns = await queryRunner.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'locations' AND COLUMN_NAME = 'boundary'`,
    );
    if (Array.isArray(columns) && columns.length) return;
    await queryRunner.query('ALTER TABLE locations ADD COLUMN boundary JSON NULL');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE locations DROP COLUMN boundary');
  }
}
