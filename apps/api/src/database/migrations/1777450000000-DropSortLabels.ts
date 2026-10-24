import { MigrationInterface, QueryRunner } from 'typeorm';

// Featured-first and by-location sorting were removed (2026-10-24): they
// didn't fit every client and the sort list now follows Resales. Their
// labels go too, so they no longer show in Labels. down() can't bring back a
// client's own wording; the defaults return with the code that used them.
const KEYS = ['sort_featured', 'sort_location'];

export class DropSortLabels1777450000000 implements MigrationInterface {
  name = 'DropSortLabels1777450000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM labels WHERE \`key\` IN (${KEYS.map(() => '?').join(',')})`, KEYS);
  }

  public async down(): Promise<void> {
    // Nothing to restore.
  }
}
