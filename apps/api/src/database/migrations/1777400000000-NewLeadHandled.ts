import { MigrationInterface, QueryRunner } from 'typeorm';

// New Leads as an enquiry inbox (2026-10-23): clients without Buyer Match
// mark an enquiry handled instead of adding the person to Contacts. The lead
// stays a new lead, so it can still go to Contacts once Buyer Match is on.
export class NewLeadHandled1777400000000 implements MigrationInterface {
  name = 'NewLeadHandled1777400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('leads', 'newLeadHandledAt'))) {
      await queryRunner.query('ALTER TABLE leads ADD COLUMN newLeadHandledAt TIMESTAMP NULL DEFAULT NULL');
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasColumn('leads', 'newLeadHandledAt')) {
      await queryRunner.query('ALTER TABLE leads DROP COLUMN newLeadHandledAt');
    }
  }
}
