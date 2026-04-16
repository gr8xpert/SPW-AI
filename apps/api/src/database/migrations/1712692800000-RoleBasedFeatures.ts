import { MigrationInterface, QueryRunner } from 'typeorm';

export class RoleBasedFeatures1712692800000 implements MigrationInterface {
  name = 'RoleBasedFeatures1712692800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ============ ALTER USERS TABLE - Add webmaster role ============
    await queryRunner.query(`
      ALTER TABLE users
      MODIFY COLUMN role ENUM('super_admin', 'webmaster', 'admin', 'user') NOT NULL DEFAULT 'user'
    `);

    // ============ ALTER TENANTS TABLE - Add subscription and widget fields ============
    await queryRunner.query(`
      ALTER TABLE tenants
      ADD COLUMN ownerEmail VARCHAR(255) NULL AFTER domain,
      ADD COLUMN siteName VARCHAR(255) NULL AFTER ownerEmail,
      ADD COLUMN apiUrl VARCHAR(500) NULL AFTER siteName,
      ADD COLUMN subscriptionStatus ENUM('active', 'grace', 'expired', 'manual', 'internal') NOT NULL DEFAULT 'active' AFTER isActive,
      ADD COLUMN billingCycle ENUM('monthly', 'yearly') NULL AFTER subscriptionStatus,
      ADD COLUMN billingSource ENUM('manual', 'paddle', 'internal') NULL AFTER billingCycle,
      ADD COLUMN expiresAt TIMESTAMP NULL AFTER billingSource,
      ADD COLUMN graceEndsAt TIMESTAMP NULL AFTER expiresAt,
      ADD COLUMN adminOverride BOOLEAN NOT NULL DEFAULT FALSE AFTER graceEndsAt,
      ADD COLUMN isInternal BOOLEAN NOT NULL DEFAULT FALSE AFTER adminOverride,
      ADD COLUMN widgetEnabled BOOLEAN NOT NULL DEFAULT TRUE AFTER isInternal,
      ADD COLUMN aiSearchEnabled BOOLEAN NOT NULL DEFAULT FALSE AFTER widgetEnabled,
      ADD COLUMN widgetFeatures JSON DEFAULT ('["search", "detail", "wishlist"]') AFTER aiSearchEnabled
    `);

    // ============ LICENSE KEYS TABLE ============
    await queryRunner.query(`
      CREATE TABLE license_keys (
        id INT PRIMARY KEY AUTO_INCREMENT,
        tenantId INT NOT NULL,
        \`key\` VARCHAR(50) NOT NULL UNIQUE,
        status ENUM('active', 'revoked') NOT NULL DEFAULT 'active',
        domain VARCHAR(255) NULL,
        activatedAt TIMESTAMP NULL,
        revokedAt TIMESTAMP NULL,
        lastUsedAt TIMESTAMP NULL,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (tenantId) REFERENCES tenants(id) ON DELETE CASCADE,
        INDEX idx_tenant (tenantId),
        INDEX idx_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // ============ CREDIT BALANCE TABLE ============
    await queryRunner.query(`
      CREATE TABLE credit_balances (
        id INT PRIMARY KEY AUTO_INCREMENT,
        tenantId INT NOT NULL UNIQUE,
        balance DECIMAL(10,2) NOT NULL DEFAULT 0,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (tenantId) REFERENCES tenants(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // ============ CREDIT TRANSACTIONS TABLE ============
    await queryRunner.query(`
      CREATE TABLE credit_transactions (
        id INT PRIMARY KEY AUTO_INCREMENT,
        tenantId INT NOT NULL,
        type ENUM('purchase', 'consume', 'refund', 'adjustment') NOT NULL,
        amount DECIMAL(10,2) NOT NULL,
        balanceAfter DECIMAL(10,2) NOT NULL,
        ticketId INT NULL,
        paymentReference VARCHAR(255) NULL,
        description TEXT NULL,
        createdBy INT NULL,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (tenantId) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (ticketId) REFERENCES tickets(id) ON DELETE SET NULL,
        FOREIGN KEY (createdBy) REFERENCES users(id) ON DELETE SET NULL,
        INDEX idx_tenant (tenantId),
        INDEX idx_created_at (createdAt)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // ============ TIME ENTRIES TABLE (Webmaster hours) ============
    await queryRunner.query(`
      CREATE TABLE time_entries (
        id INT PRIMARY KEY AUTO_INCREMENT,
        ticketId INT NOT NULL,
        userId INT NOT NULL,
        hours DECIMAL(5,2) NOT NULL,
        description TEXT NULL,
        workDate DATE NULL,
        isPaid BOOLEAN NOT NULL DEFAULT FALSE,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (ticketId) REFERENCES tickets(id) ON DELETE CASCADE,
        FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_ticket (ticketId),
        INDEX idx_user (userId),
        INDEX idx_created_at (createdAt)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // ============ EMAIL SUPPRESSIONS TABLE ============
    await queryRunner.query(`
      CREATE TABLE email_suppressions (
        id INT PRIMARY KEY AUTO_INCREMENT,
        tenantId INT NOT NULL,
        email VARCHAR(255) NOT NULL,
        reason VARCHAR(500) NULL,
        createdBy INT NULL,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (tenantId) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (createdBy) REFERENCES users(id) ON DELETE SET NULL,
        UNIQUE KEY unique_tenant_email (tenantId, email),
        INDEX idx_email (email)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // ============ PROPERTY TYPE GROUPS TABLE ============
    await queryRunner.query(`
      CREATE TABLE property_type_groups (
        id INT PRIMARY KEY AUTO_INCREMENT,
        tenantId INT NOT NULL,
        name JSON NOT NULL,
        slug VARCHAR(100) NOT NULL,
        propertyTypeIds JSON DEFAULT ('[]'),
        sortOrder INT NOT NULL DEFAULT 0,
        isActive BOOLEAN NOT NULL DEFAULT TRUE,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (tenantId) REFERENCES tenants(id) ON DELETE CASCADE,
        INDEX idx_tenant (tenantId),
        UNIQUE KEY unique_tenant_slug (tenantId, slug)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // ============ FEATURE GROUPS TABLE ============
    await queryRunner.query(`
      CREATE TABLE feature_groups (
        id INT PRIMARY KEY AUTO_INCREMENT,
        tenantId INT NOT NULL,
        name JSON NOT NULL,
        slug VARCHAR(100) NOT NULL,
        featureIds JSON DEFAULT ('[]'),
        sortOrder INT NOT NULL DEFAULT 0,
        isActive BOOLEAN NOT NULL DEFAULT TRUE,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (tenantId) REFERENCES tenants(id) ON DELETE CASCADE,
        INDEX idx_tenant (tenantId),
        UNIQUE KEY unique_tenant_slug (tenantId, slug)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // ============ AUDIT LOGS TABLE ============
    await queryRunner.query(`
      CREATE TABLE audit_logs (
        id INT PRIMARY KEY AUTO_INCREMENT,
        tenantId INT NULL,
        userId INT NULL,
        action ENUM('create', 'update', 'delete', 'login', 'logout', 'view', 'export') NOT NULL,
        entityType VARCHAR(100) NOT NULL,
        entityId INT NULL,
        changes JSON NULL,
        ipAddress VARCHAR(45) NULL,
        userAgent VARCHAR(500) NULL,
        metadata JSON NULL,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (tenantId) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (userId) REFERENCES users(id) ON DELETE SET NULL,
        INDEX idx_tenant (tenantId),
        INDEX idx_user (userId),
        INDEX idx_entity (entityType, entityId),
        INDEX idx_created_at (createdAt)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // ============ SUBSCRIPTION PAYMENTS TABLE ============
    await queryRunner.query(`
      CREATE TABLE subscription_payments (
        id INT PRIMARY KEY AUTO_INCREMENT,
        tenantId INT NOT NULL,
        planId INT NULL,
        type ENUM('new', 'renewal', 'upgrade', 'downgrade') NOT NULL,
        amount DECIMAL(10,2) NOT NULL,
        currency VARCHAR(3) NOT NULL DEFAULT 'EUR',
        billingCycle ENUM('monthly', 'yearly') NOT NULL,
        paddleTransactionId VARCHAR(255) NULL,
        paddleSubscriptionId VARCHAR(255) NULL,
        paddleCustomerId VARCHAR(255) NULL,
        status ENUM('pending', 'completed', 'failed', 'refunded', 'cancelled') NOT NULL DEFAULT 'pending',
        paddleWebhookData JSON NULL,
        failureReason TEXT NULL,
        paidAt TIMESTAMP NULL,
        refundedAt TIMESTAMP NULL,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (tenantId) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (planId) REFERENCES plans(id) ON DELETE SET NULL,
        INDEX idx_tenant (tenantId),
        INDEX idx_paddle_txn (paddleTransactionId),
        INDEX idx_status (status),
        INDEX idx_created_at (createdAt)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // ============ ADD INDEXES FOR PERFORMANCE ============
    await queryRunner.query(`
      CREATE INDEX idx_tenants_subscription ON tenants(subscriptionStatus, expiresAt)
    `);

    await queryRunner.query(`
      CREATE INDEX idx_tenants_internal ON tenants(isInternal, adminOverride)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes
    await queryRunner.query(`DROP INDEX idx_tenants_internal ON tenants`);
    await queryRunner.query(`DROP INDEX idx_tenants_subscription ON tenants`);

    // Drop tables in reverse order
    await queryRunner.query(`DROP TABLE IF EXISTS subscription_payments`);
    await queryRunner.query(`DROP TABLE IF EXISTS audit_logs`);
    await queryRunner.query(`DROP TABLE IF EXISTS feature_groups`);
    await queryRunner.query(`DROP TABLE IF EXISTS property_type_groups`);
    await queryRunner.query(`DROP TABLE IF EXISTS email_suppressions`);
    await queryRunner.query(`DROP TABLE IF EXISTS time_entries`);
    await queryRunner.query(`DROP TABLE IF EXISTS credit_transactions`);
    await queryRunner.query(`DROP TABLE IF EXISTS credit_balances`);
    await queryRunner.query(`DROP TABLE IF EXISTS license_keys`);

    // Revert tenant columns
    await queryRunner.query(`
      ALTER TABLE tenants
      DROP COLUMN widgetFeatures,
      DROP COLUMN aiSearchEnabled,
      DROP COLUMN widgetEnabled,
      DROP COLUMN isInternal,
      DROP COLUMN adminOverride,
      DROP COLUMN graceEndsAt,
      DROP COLUMN expiresAt,
      DROP COLUMN billingSource,
      DROP COLUMN billingCycle,
      DROP COLUMN subscriptionStatus,
      DROP COLUMN apiUrl,
      DROP COLUMN siteName,
      DROP COLUMN ownerEmail
    `);

    // Revert user role enum
    await queryRunner.query(`
      ALTER TABLE users
      MODIFY COLUMN role ENUM('super_admin', 'admin', 'user') NOT NULL DEFAULT 'user'
    `);
  }
}
