import { MigrationInterface, QueryRunner } from 'typeorm';

// translation_memory: label, feature and property type translations shared by
// every client, keyed by the English text. sourceKey is binary so "Cafe" and
// "Café" stay two entries.
export class TranslationMemory1777190000000 implements MigrationInterface {
  name = 'TranslationMemory1777190000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('translation_memory')) return;
    await queryRunner.query(`
      CREATE TABLE translation_memory (
        id INT NOT NULL AUTO_INCREMENT,
        kind VARCHAR(20) NOT NULL,
        sourceKey VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
        lang VARCHAR(10) NOT NULL,
        text TEXT NOT NULL,
        source VARCHAR(10) NOT NULL DEFAULT 'ai',
        createdAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updatedAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        UNIQUE KEY uq_translation_memory (kind, sourceKey, lang)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS translation_memory');
  }
}
