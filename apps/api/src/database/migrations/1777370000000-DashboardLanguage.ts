import { MigrationInterface, QueryRunner } from 'typeorm';

// The language each user sees the client dashboard in (2026-10-22); null = English.
export class DashboardLanguage1777370000000 implements MigrationInterface {
  name = 'DashboardLanguage1777370000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('users', 'dashboardLanguage'))) {
      await queryRunner.query('ALTER TABLE users ADD COLUMN dashboardLanguage VARCHAR(5) NULL');
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasColumn('users', 'dashboardLanguage')) {
      await queryRunner.query('ALTER TABLE users DROP COLUMN dashboardLanguage');
    }
  }
}
