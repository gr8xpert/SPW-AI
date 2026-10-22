import { MigrationInterface, QueryRunner } from 'typeorm';

// New Leads (2026-10-22): website-form people wait here until someone picks
// their role. Existing records are already sorted, so they start at 0.
export class NewLeads1777360000000 implements MigrationInterface {
  name = 'NewLeads1777360000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('leads', 'isNewLead'))) {
      await queryRunner.query('ALTER TABLE leads ADD COLUMN isNewLead TINYINT(1) NOT NULL DEFAULT 0, ADD INDEX IDX_leads_tenant_new (tenantId, isNewLead)');
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasColumn('leads', 'isNewLead')) {
      await queryRunner.query('ALTER TABLE leads DROP INDEX IDX_leads_tenant_new, DROP COLUMN isNewLead');
    }
  }
}
