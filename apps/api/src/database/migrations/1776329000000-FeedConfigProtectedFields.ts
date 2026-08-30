import { MigrationInterface, QueryRunner } from 'typeorm';

export class FeedConfigProtectedFields1776329000000 implements MigrationInterface {
  name = 'FeedConfigProtectedFields1776329000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE feed_configs
        ADD COLUMN protectedFields JSON NULL AFTER fieldMapping
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE feed_configs DROP COLUMN protectedFields
    `);
  }
}
