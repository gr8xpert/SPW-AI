import { MigrationInterface, QueryRunner } from 'typeorm';

export class FeedImport1712520000000 implements MigrationInterface {
  name = 'FeedImport1712520000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create feed_configs table
    await queryRunner.query(`
      CREATE TABLE feed_configs (
        id INT PRIMARY KEY AUTO_INCREMENT,
        tenantId INT NOT NULL,
        provider ENUM('resales', 'inmoba', 'infocasa', 'redsp') NOT NULL,
        name VARCHAR(100) NOT NULL,
        credentials JSON NOT NULL,
        fieldMapping JSON,
        syncSchedule VARCHAR(50) DEFAULT '0 2 * * *',
        isActive BOOLEAN DEFAULT TRUE,
        lastSyncAt TIMESTAMP NULL,
        lastSyncStatus ENUM('success', 'partial', 'failed'),
        lastSyncCount INT DEFAULT 0,
        lastError TEXT,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_tenant_active (tenantId, isActive),
        FOREIGN KEY (tenantId) REFERENCES tenants(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Create feed_import_logs table
    await queryRunner.query(`
      CREATE TABLE feed_import_logs (
        id INT PRIMARY KEY AUTO_INCREMENT,
        feedConfigId INT NOT NULL,
        tenantId INT NOT NULL,
        startedAt TIMESTAMP NOT NULL,
        completedAt TIMESTAMP NULL,
        status ENUM('running', 'success', 'partial', 'failed') DEFAULT 'running',
        totalFetched INT DEFAULT 0,
        createdCount INT DEFAULT 0,
        updatedCount INT DEFAULT 0,
        skippedCount INT DEFAULT 0,
        errorCount INT DEFAULT 0,
        errors JSON,
        INDEX idx_tenant_date (tenantId, startedAt),
        FOREIGN KEY (feedConfigId) REFERENCES feed_configs(id) ON DELETE CASCADE,
        FOREIGN KEY (tenantId) REFERENCES tenants(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS feed_import_logs`);
    await queryRunner.query(`DROP TABLE IF EXISTS feed_configs`);
  }
}
