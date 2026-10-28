import { MigrationInterface, QueryRunner } from 'typeorm';

// Extra website keys with their own scope (2026-10-28). The main key stays on
// tenants.apiKeyHash untouched, so existing sites keep working as before.
export class ApiKeys1777470000000 implements MigrationInterface {
  name = 'ApiKeys1777470000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('api_keys')) return;
    await queryRunner.query(`
      CREATE TABLE api_keys (
        id INT NOT NULL AUTO_INCREMENT,
        tenantId INT NOT NULL,
        name VARCHAR(100) NOT NULL,
        keyHash CHAR(64) NOT NULL,
        last4 CHAR(4) NOT NULL,
        scope JSON NULL,
        isActive TINYINT NOT NULL DEFAULT 1,
        lastUsedAt TIMESTAMP NULL,
        lastUsedOrigin VARCHAR(255) NULL,
        createdAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        UNIQUE INDEX uq_api_keys_hash (keyHash),
        INDEX idx_api_keys_tenant (tenantId),
        CONSTRAINT fk_api_keys_tenant FOREIGN KEY (tenantId) REFERENCES tenants (id) ON DELETE CASCADE
      ) ENGINE=InnoDB
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS api_keys');
  }
}
