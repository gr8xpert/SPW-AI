import { MigrationInterface, QueryRunner } from 'typeorm';

// A client's own Anthropic key (Settings → AI, 2026-10-23), encrypted like
// openrouterApiKey. Which one is used is settings.aiProvider.
export class TenantAnthropicKey1777390000000 implements MigrationInterface {
  name = 'TenantAnthropicKey1777390000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('tenants', 'anthropicApiKey'))) {
      await queryRunner.query('ALTER TABLE tenants ADD COLUMN anthropicApiKey VARCHAR(500) NULL');
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasColumn('tenants', 'anthropicApiKey')) {
      await queryRunner.query('ALTER TABLE tenants DROP COLUMN anthropicApiKey');
    }
  }
}
