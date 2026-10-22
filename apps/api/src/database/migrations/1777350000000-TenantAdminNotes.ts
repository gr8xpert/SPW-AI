import { MigrationInterface, QueryRunner } from 'typeorm';

// Super Admin's private notes about a client (Edit client page, 2026-10-22).
export class TenantAdminNotes1777350000000 implements MigrationInterface {
  name = 'TenantAdminNotes1777350000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('tenants', 'adminNotes'))) {
      await queryRunner.query('ALTER TABLE tenants ADD COLUMN adminNotes TEXT NULL');
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasColumn('tenants', 'adminNotes')) {
      await queryRunner.query('ALTER TABLE tenants DROP COLUMN adminNotes');
    }
  }
}
