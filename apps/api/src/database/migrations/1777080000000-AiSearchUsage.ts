import { MigrationInterface, QueryRunner } from 'typeorm';

// ai_search_usage: how many AI searches a client's site ran each day. The
// feature spends the client's own OpenRouter credit, so it needs a daily
// ceiling — and a ceiling needs a count that survives a restart.
export class AiSearchUsage1777080000000 implements MigrationInterface {
  name = 'AiSearchUsage1777080000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('ai_search_usage')) return;
    await queryRunner.query(`
      CREATE TABLE ai_search_usage (
        tenantId INT NOT NULL,
        day DATE NOT NULL,
        count INT NOT NULL DEFAULT 0,
        PRIMARY KEY (tenantId, day),
        CONSTRAINT fk_ai_search_usage_tenant FOREIGN KEY (tenantId)
          REFERENCES tenants (id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS ai_search_usage');
  }
}
