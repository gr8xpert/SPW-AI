import { MigrationInterface, QueryRunner } from 'typeorm';

// An Odoo import used to stamp lastActivityAt with the import time. Imported
// buyers nobody has touched since go back to their Odoo date. Anything an
// agent did on a buyer (an activity or a change) keeps that buyer as it is.
export class ImportedLastActivity1777530000000 implements MigrationInterface {
  name = 'ImportedLastActivity1777530000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE leads l SET l.lastActivityAt = l.createdAt, l.updatedAt = l.updatedAt
       WHERE l.importRef IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM lead_activities a WHERE a.leadId = l.id AND a.type <> 'import')
         AND NOT EXISTS (SELECT 1 FROM lead_changes c WHERE c.leadId = l.id AND c.source <> 'import')`,
    );
  }

  public async down(): Promise<void> {
    // The old import times are not kept.
  }
}
