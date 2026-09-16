import { MigrationInterface, QueryRunner } from 'typeorm';

// Backs the "Forgot your password?" flow. Idempotent via IF NOT EXISTS.
export class PasswordResetTokens1777020000000 implements MigrationInterface {
  name = 'PasswordResetTokens1777020000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id INT PRIMARY KEY AUTO_INCREMENT,
        userId INT NOT NULL,
        tokenHash CHAR(64) NOT NULL UNIQUE,
        expiresAt TIMESTAMP NOT NULL,
        consumedAt TIMESTAMP NULL,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_password_reset_user (userId),
        INDEX idx_password_reset_expires (expiresAt)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS password_reset_tokens`);
  }
}
