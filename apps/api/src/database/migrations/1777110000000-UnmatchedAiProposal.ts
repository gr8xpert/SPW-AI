import { MigrationInterface, QueryRunner } from 'typeorm';

// location_template_unmatched.aiProposal: what the AI review thinks an unknown
// feed place name is — another spelling of a template place, a new town in a
// municipality, or not a place — with its reason and how far the listings are
// from the suggested place. Super Admin accepts it with one click.
export class UnmatchedAiProposal1777110000000 implements MigrationInterface {
  name = 'UnmatchedAiProposal1777110000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const rows = await queryRunner.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'location_template_unmatched' AND COLUMN_NAME = 'aiProposal'`,
    );
    if (!Array.isArray(rows) || rows.length === 0) {
      await queryRunner.query('ALTER TABLE location_template_unmatched ADD COLUMN aiProposal JSON NULL');
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE location_template_unmatched DROP COLUMN aiProposal');
  }
}
