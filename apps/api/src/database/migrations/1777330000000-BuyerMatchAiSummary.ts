import { MigrationInterface, QueryRunner } from 'typeorm';

// Buyer Match, milestone M (Phase 3 AI): the buyer summary cached on the
// buyer with the hash of what it was written from (regenerated only when that
// changes), and the feedback suggestions an agent dismissed.
const COLUMNS: [column: string, ddl: string][] = [
  ['aiSummary', 'TEXT NULL'],
  ['aiSummaryHash', 'CHAR(64) NULL'],
  ['aiSummaryAt', 'DATETIME NULL'],
  ['aiDismissed', 'JSON NULL'],
];

export class BuyerMatchAiSummary1777330000000 implements MigrationInterface {
  name = 'BuyerMatchAiSummary1777330000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const [column, ddl] of COLUMNS) {
      if (!(await queryRunner.hasColumn('leads', column))) await queryRunner.query(`ALTER TABLE leads ADD COLUMN ${column} ${ddl}`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const [column] of [...COLUMNS].reverse()) {
      if (await queryRunner.hasColumn('leads', column)) await queryRunner.query(`ALTER TABLE leads DROP COLUMN ${column}`);
    }
  }
}
