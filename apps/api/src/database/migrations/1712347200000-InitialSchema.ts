import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1712347200000 implements MigrationInterface {
  name = 'InitialSchema1712347200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create plans table
    await queryRunner.query(`
      CREATE TABLE plans (
        id INT PRIMARY KEY AUTO_INCREMENT,
        name VARCHAR(100) NOT NULL,
        slug VARCHAR(100) UNIQUE NOT NULL,
        priceMonthly DECIMAL(10,2),
        priceYearly DECIMAL(10,2),
        maxProperties INT DEFAULT 100,
        maxUsers INT DEFAULT 5,
        features JSON,
        isActive BOOLEAN DEFAULT TRUE,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Create tenants table
    await queryRunner.query(`
      CREATE TABLE tenants (
        id INT PRIMARY KEY AUTO_INCREMENT,
        name VARCHAR(255) NOT NULL,
        slug VARCHAR(100) UNIQUE NOT NULL,
        domain VARCHAR(255),
        planId INT NOT NULL,
        apiKeyHash CHAR(64) UNIQUE NOT NULL,
        apiKeyLast4 CHAR(4) NOT NULL,
        webhookSecret VARCHAR(128) NOT NULL,
        webhookUrl VARCHAR(500),
        settings JSON DEFAULT ('{"theme":"light","languages":["en"],"defaultLanguage":"en","timezone":"UTC"}'),
        syncVersion INT DEFAULT 1,
        isActive BOOLEAN DEFAULT TRUE,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_tenants_slug (slug),
        FOREIGN KEY (planId) REFERENCES plans(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Create users table
    await queryRunner.query(`
      CREATE TABLE users (
        id INT PRIMARY KEY AUTO_INCREMENT,
        tenantId INT NOT NULL,
        email VARCHAR(255) NOT NULL,
        passwordHash VARCHAR(255) NOT NULL,
        name VARCHAR(255),
        role ENUM('super_admin', 'admin', 'user') DEFAULT 'user',
        permissions JSON,
        avatarUrl VARCHAR(500),
        twoFactorSecret VARCHAR(100),
        twoFactorEnabled BOOLEAN DEFAULT FALSE,
        emailVerifiedAt TIMESTAMP NULL,
        lastLoginAt TIMESTAMP NULL,
        isActive BOOLEAN DEFAULT TRUE,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY unique_tenant_email (tenantId, email),
        FOREIGN KEY (tenantId) REFERENCES tenants(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Insert default plans
    await queryRunner.query(`
      INSERT INTO plans (name, slug, priceMonthly, priceYearly, maxProperties, maxUsers, features, isActive) VALUES
      ('Free', 'free', 0, 0, 10, 1, '{"feeds":false,"campaigns":false,"analytics":false,"apiAccess":false,"customBranding":false}', TRUE),
      ('Starter', 'starter', 29.00, 290.00, 50, 2, '{"feeds":true,"campaigns":false,"analytics":true,"apiAccess":true,"customBranding":false}', TRUE),
      ('Professional', 'professional', 79.00, 790.00, 200, 5, '{"feeds":true,"campaigns":true,"analytics":true,"apiAccess":true,"customBranding":true}', TRUE),
      ('Enterprise', 'enterprise', 199.00, 1990.00, 1000, 20, '{"feeds":true,"campaigns":true,"analytics":true,"apiAccess":true,"customBranding":true}', TRUE)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS users`);
    await queryRunner.query(`DROP TABLE IF EXISTS tenants`);
    await queryRunner.query(`DROP TABLE IF EXISTS plans`);
  }
}
