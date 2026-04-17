import { MigrationInterface, QueryRunner } from 'typeorm';

export class EmailVerificationTokens1776298800000 implements MigrationInterface {
  name = 'EmailVerificationTokens1776298800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE email_verification_tokens (
        id INT PRIMARY KEY AUTO_INCREMENT,
        userId INT NOT NULL,
        tokenHash CHAR(64) NOT NULL UNIQUE,
        expiresAt TIMESTAMP NOT NULL,
        consumedAt TIMESTAMP NULL,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_email_verify_user (userId),
        INDEX idx_email_verify_expires (expiresAt)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE email_verification_tokens`);
  }
}
