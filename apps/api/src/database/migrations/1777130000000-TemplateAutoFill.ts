import { MigrationInterface, QueryRunner } from 'typeorm';

// location_template_nodes.autoFill: which point/postcode the automatic fill
// (map geocoder, then AI) put on a place, so Super Admin can see it and undo it.
export class TemplateAutoFill1777130000000 implements MigrationInterface {
  name = 'TemplateAutoFill1777130000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const rows = await queryRunner.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'location_template_nodes' AND COLUMN_NAME = 'autoFill'`,
    );
    if (!Array.isArray(rows) || rows.length === 0) {
      await queryRunner.query('ALTER TABLE location_template_nodes ADD COLUMN autoFill JSON NULL');
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE location_template_nodes DROP COLUMN autoFill');
  }
}
