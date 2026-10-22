import { MigrationInterface, QueryRunner } from 'typeorm';

// Buyer Match, milestone F: the personal buyer page. Each buyer gets a
// random code for their private link (switched off or replaced by the
// agent), and the WordPress plugin reports the address of the page it made.
// ADD COLUMN touches no row, so leads.updatedAt keeps its values.
export class BuyerMatchPage1777270000000 implements MigrationInterface {
  name = 'BuyerMatchPage1777270000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('leads', 'pageCode'))) {
      await queryRunner.query('ALTER TABLE leads ADD COLUMN pageCode VARCHAR(16) NULL, ADD UNIQUE INDEX uq_leads_page_code (pageCode)');
    }
    if (!(await queryRunner.hasColumn('leads', 'pageEnabled'))) {
      await queryRunner.query('ALTER TABLE leads ADD COLUMN pageEnabled TINYINT(1) NOT NULL DEFAULT 1');
    }
    if (!(await queryRunner.hasColumn('site_checkins', 'buyerPageUrl'))) {
      await queryRunner.query('ALTER TABLE site_checkins ADD COLUMN buyerPageUrl VARCHAR(500) NULL');
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasColumn('site_checkins', 'buyerPageUrl')) {
      await queryRunner.query('ALTER TABLE site_checkins DROP COLUMN buyerPageUrl');
    }
    if (await queryRunner.hasColumn('leads', 'pageEnabled')) {
      await queryRunner.query('ALTER TABLE leads DROP COLUMN pageEnabled');
    }
    if (await queryRunner.hasColumn('leads', 'pageCode')) {
      await queryRunner.query('ALTER TABLE leads DROP INDEX uq_leads_page_code, DROP COLUMN pageCode');
    }
  }
}
