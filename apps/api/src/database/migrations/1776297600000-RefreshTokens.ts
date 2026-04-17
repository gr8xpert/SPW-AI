import { MigrationInterface, QueryRunner } from 'typeorm';

export class RefreshTokens1776297600000 implements MigrationInterface {
  name = 'RefreshTokens1776297600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE refresh_tokens (
        id INT PRIMARY KEY AUTO_INCREMENT,
        userId INT NOT NULL,
        tenantId INT NOT NULL,
        familyId CHAR(32) NOT NULL,
        tokenHash CHAR(64) NOT NULL UNIQUE,
        expiresAt TIMESTAMP NOT NULL,
        revokedAt TIMESTAMP NULL,
        revokedReason ENUM('rotated', 'reused', 'logout') NULL,
        replacedByHash CHAR(64) NULL,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (tenantId) REFERENCES tenants(id) ON DELETE CASCADE,
        INDEX idx_refresh_family (familyId, revokedAt),
        INDEX idx_refresh_user (userId),
        INDEX idx_refresh_expires (expiresAt)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE refresh_tokens`);
  }
}
