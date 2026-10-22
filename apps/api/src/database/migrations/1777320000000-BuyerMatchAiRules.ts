import { MigrationInterface, QueryRunner } from 'typeorm';

// Buyer Match, milestone L (Phase 3 AI): the rules an agent accepted from a
// buyer's notes ("does NOT want a ground floor"), and a hash of the notes
// they were read from, so the record can say when the notes changed since.
const COLUMNS: [column: string, ddl: string][] = [
  ['noteRules', 'JSON NULL'],
  ['noteRulesHash', 'CHAR(64) NULL'],
];

export class BuyerMatchAiRules1777320000000 implements MigrationInterface {
  name = 'BuyerMatchAiRules1777320000000';

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
