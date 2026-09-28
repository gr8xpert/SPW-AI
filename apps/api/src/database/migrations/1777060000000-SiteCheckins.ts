import { MigrationInterface, QueryRunner } from 'typeorm';

// site_checkins: which client websites (WordPress plugin / widget) talk to
// the API and when they last did — for the client's Website Health page.
export class SiteCheckins1777060000000 implements MigrationInterface {
  name = 'SiteCheckins1777060000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('site_checkins')) return;
    await queryRunner.query(`
      CREATE TABLE site_checkins (
        id INT NOT NULL AUTO_INCREMENT,
        tenantId INT NOT NULL,
        siteUrl VARCHAR(255) NOT NULL,
        source ENUM('plugin','widget') NOT NULL,
        pluginVersion VARCHAR(20) NULL,
        firstSeenAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        lastSeenAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_site_checkins_site (tenantId, siteUrl, source),
        CONSTRAINT fk_site_checkins_tenant FOREIGN KEY (tenantId) REFERENCES tenants(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS site_checkins`);
  }
}
