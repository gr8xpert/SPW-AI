import { MigrationInterface, QueryRunner } from 'typeorm';

export class Phase2Features1712606400000 implements MigrationInterface {
  name = 'Phase2Features1712606400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ============ TICKET SYSTEM TABLES ============
    await queryRunner.query(`
      CREATE TABLE tickets (
        id INT PRIMARY KEY AUTO_INCREMENT,
        tenantId INT NOT NULL,
        userId INT NOT NULL,
        assignedTo INT,
        ticketNumber VARCHAR(20) NOT NULL UNIQUE,
        subject VARCHAR(255) NOT NULL,
        status ENUM('open', 'in_progress', 'waiting_customer', 'resolved', 'closed') DEFAULT 'open',
        priority ENUM('low', 'medium', 'high', 'urgent') DEFAULT 'medium',
        category ENUM('technical', 'billing', 'feature_request', 'bug', 'general') DEFAULT 'general',
        lastReplyAt TIMESTAMP NULL,
        firstResponseAt TIMESTAMP NULL,
        resolvedAt TIMESTAMP NULL,
        closedAt TIMESTAMP NULL,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (tenantId) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (assignedTo) REFERENCES users(id) ON DELETE SET NULL,
        INDEX idx_tenant_status (tenantId, status),
        INDEX idx_assigned (assignedTo, status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await queryRunner.query(`
      CREATE TABLE ticket_messages (
        id INT PRIMARY KEY AUTO_INCREMENT,
        ticketId INT NOT NULL,
        userId INT NOT NULL,
        isStaff BOOLEAN DEFAULT FALSE,
        message TEXT NOT NULL,
        attachments JSON,
        isInternal BOOLEAN DEFAULT FALSE,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (ticketId) REFERENCES tickets(id) ON DELETE CASCADE,
        FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_ticket_date (ticketId, createdAt)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // ============ CONTACT TABLE ============
    await queryRunner.query(`
      CREATE TABLE contacts (
        id INT PRIMARY KEY AUTO_INCREMENT,
        tenantId INT NOT NULL,
        email VARCHAR(255) NOT NULL,
        name VARCHAR(255),
        phone VARCHAR(50),
        source ENUM('inquiry', 'newsletter', 'import', 'manual', 'api') DEFAULT 'manual',
        sourcePropertyId INT,
        preferences JSON,
        tags JSON,
        subscribed BOOLEAN DEFAULT TRUE,
        unsubscribedAt TIMESTAMP NULL,
        bounceCount INT DEFAULT 0,
        lastEmailAt TIMESTAMP NULL,
        lastOpenAt TIMESTAMP NULL,
        lastClickAt TIMESTAMP NULL,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (tenantId) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (sourcePropertyId) REFERENCES properties(id) ON DELETE SET NULL,
        UNIQUE KEY unique_tenant_email (tenantId, email),
        INDEX idx_tenant_subscribed (tenantId, subscribed)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // ============ LEAD MANAGEMENT TABLES ============
    await queryRunner.query(`
      CREATE TABLE leads (
        id INT PRIMARY KEY AUTO_INCREMENT,
        tenantId INT NOT NULL,
        contactId INT NOT NULL,
        propertyId INT,
        source ENUM('widget_inquiry', 'phone', 'email', 'walkin', 'referral', 'website', 'other') DEFAULT 'widget_inquiry',
        status ENUM('new', 'contacted', 'qualified', 'viewing_scheduled', 'offer_made', 'negotiating', 'won', 'lost') DEFAULT 'new',
        assignedTo INT,
        score INT DEFAULT 0,
        budgetMin DECIMAL(15,2),
        budgetMax DECIMAL(15,2),
        budgetCurrency VARCHAR(3) DEFAULT 'EUR',
        preferredLocations JSON,
        preferredTypes JSON,
        preferredFeatures JSON,
        preferredBedroomsMin TINYINT UNSIGNED,
        preferredBedroomsMax TINYINT UNSIGNED,
        notes TEXT,
        nextFollowUp TIMESTAMP NULL,
        lastContactAt TIMESTAMP NULL,
        wonAt TIMESTAMP NULL,
        wonPropertyId INT,
        wonAmount DECIMAL(15,2),
        lostAt TIMESTAMP NULL,
        lostReason VARCHAR(255),
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (tenantId) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (contactId) REFERENCES contacts(id) ON DELETE CASCADE,
        FOREIGN KEY (propertyId) REFERENCES properties(id) ON DELETE SET NULL,
        FOREIGN KEY (assignedTo) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY (wonPropertyId) REFERENCES properties(id) ON DELETE SET NULL,
        INDEX idx_tenant_status (tenantId, status),
        INDEX idx_assigned (assignedTo, status),
        INDEX idx_follow_up (nextFollowUp)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await queryRunner.query(`
      CREATE TABLE lead_activities (
        id INT PRIMARY KEY AUTO_INCREMENT,
        leadId INT NOT NULL,
        userId INT NOT NULL,
        type ENUM('note', 'call', 'email', 'sms', 'viewing', 'offer', 'meeting', 'status_change', 'assignment') NOT NULL,
        description TEXT,
        metadata JSON,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (leadId) REFERENCES leads(id) ON DELETE CASCADE,
        FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_lead_date (leadId, createdAt)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // ============ ANALYTICS TABLES ============
    await queryRunner.query(`
      CREATE TABLE property_views (
        id BIGINT PRIMARY KEY AUTO_INCREMENT,
        tenantId INT NOT NULL,
        propertyId INT NOT NULL,
        sessionId VARCHAR(64) NOT NULL,
        visitorIpHash VARCHAR(64),
        referrer VARCHAR(500),
        userAgent VARCHAR(500),
        durationSeconds INT,
        inquiryMade BOOLEAN DEFAULT FALSE,
        viewedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (tenantId) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (propertyId) REFERENCES properties(id) ON DELETE CASCADE,
        INDEX idx_tenant_property (tenantId, propertyId),
        INDEX idx_tenant_date (tenantId, viewedAt),
        INDEX idx_session (sessionId)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await queryRunner.query(`
      CREATE TABLE search_logs (
        id BIGINT PRIMARY KEY AUTO_INCREMENT,
        tenantId INT NOT NULL,
        sessionId VARCHAR(64) NOT NULL,
        filters JSON NOT NULL,
        resultsCount INT DEFAULT 0,
        clickedPropertyId INT,
        searchedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (tenantId) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (clickedPropertyId) REFERENCES properties(id) ON DELETE SET NULL,
        INDEX idx_tenant_date (tenantId, searchedAt)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await queryRunner.query(`
      CREATE TABLE favorites (
        id INT PRIMARY KEY AUTO_INCREMENT,
        tenantId INT NOT NULL,
        contactId INT,
        sessionId VARCHAR(64),
        propertyId INT NOT NULL,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (tenantId) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (contactId) REFERENCES contacts(id) ON DELETE CASCADE,
        FOREIGN KEY (propertyId) REFERENCES properties(id) ON DELETE CASCADE,
        INDEX idx_tenant (tenantId)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await queryRunner.query(`
      CREATE TABLE saved_searches (
        id INT PRIMARY KEY AUTO_INCREMENT,
        tenantId INT NOT NULL,
        contactId INT NOT NULL,
        name VARCHAR(100) NOT NULL,
        filters JSON NOT NULL,
        notifyNewMatches BOOLEAN DEFAULT FALSE,
        lastNotifiedAt TIMESTAMP NULL,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (tenantId) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (contactId) REFERENCES contacts(id) ON DELETE CASCADE,
        INDEX idx_notify (notifyNewMatches, lastNotifiedAt)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // ============ EMAIL CAMPAIGN TABLES ============
    await queryRunner.query(`
      CREATE TABLE tenant_email_configs (
        id INT PRIMARY KEY AUTO_INCREMENT,
        tenantId INT NOT NULL UNIQUE,
        provider ENUM('smtp', 'mailgun', 'sendgrid', 'ses') DEFAULT 'smtp',
        smtpHost VARCHAR(255),
        smtpPort INT DEFAULT 587,
        smtpUser VARCHAR(255),
        smtpPassword VARCHAR(255),
        smtpEncryption ENUM('tls', 'ssl', 'none') DEFAULT 'tls',
        apiKey VARCHAR(255),
        apiDomain VARCHAR(255),
        fromEmail VARCHAR(255) NOT NULL,
        fromName VARCHAR(255),
        replyTo VARCHAR(255),
        dailyLimit INT DEFAULT 500,
        isVerified BOOLEAN DEFAULT FALSE,
        verifiedAt TIMESTAMP NULL,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (tenantId) REFERENCES tenants(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await queryRunner.query(`
      CREATE TABLE email_templates (
        id INT PRIMARY KEY AUTO_INCREMENT,
        tenantId INT NOT NULL,
        name VARCHAR(100) NOT NULL,
        subject VARCHAR(255) NOT NULL,
        bodyHtml MEDIUMTEXT NOT NULL,
        bodyText TEXT,
        type ENUM('property_alert', 'newsletter', 'welcome', 'custom') DEFAULT 'custom',
        thumbnailUrl VARCHAR(500),
        isDefault BOOLEAN DEFAULT FALSE,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (tenantId) REFERENCES tenants(id) ON DELETE CASCADE,
        INDEX idx_tenant_type (tenantId, type)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await queryRunner.query(`
      CREATE TABLE email_campaigns (
        id INT PRIMARY KEY AUTO_INCREMENT,
        tenantId INT NOT NULL,
        templateId INT NOT NULL,
        name VARCHAR(100) NOT NULL,
        subject VARCHAR(255) NOT NULL,
        status ENUM('draft', 'scheduled', 'sending', 'paused', 'sent', 'cancelled') DEFAULT 'draft',
        recipientFilter JSON,
        featuredProperties JSON,
        scheduledAt TIMESTAMP NULL,
        startedAt TIMESTAMP NULL,
        completedAt TIMESTAMP NULL,
        pausedAt TIMESTAMP NULL,
        totalRecipients INT DEFAULT 0,
        sentCount INT DEFAULT 0,
        failedCount INT DEFAULT 0,
        openCount INT DEFAULT 0,
        clickCount INT DEFAULT 0,
        unsubscribeCount INT DEFAULT 0,
        bounceCount INT DEFAULT 0,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (tenantId) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (templateId) REFERENCES email_templates(id) ON DELETE RESTRICT,
        INDEX idx_tenant_status (tenantId, status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await queryRunner.query(`
      CREATE TABLE email_sends (
        id INT PRIMARY KEY AUTO_INCREMENT,
        campaignId INT NOT NULL,
        contactId INT NOT NULL,
        status ENUM('pending', 'sent', 'failed', 'bounced', 'complained') DEFAULT 'pending',
        sentAt TIMESTAMP NULL,
        openedAt TIMESTAMP NULL,
        clickedAt TIMESTAMP NULL,
        unsubscribedAt TIMESTAMP NULL,
        bounceType VARCHAR(50),
        errorMessage TEXT,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (campaignId) REFERENCES email_campaigns(id) ON DELETE CASCADE,
        FOREIGN KEY (contactId) REFERENCES contacts(id) ON DELETE CASCADE,
        INDEX idx_campaign_status (campaignId, status),
        INDEX idx_contact (contactId)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // ============ UPLOAD/MEDIA TABLES ============
    await queryRunner.query(`
      CREATE TABLE media_files (
        id INT PRIMARY KEY AUTO_INCREMENT,
        tenantId INT NOT NULL,
        propertyId INT,
        storageType ENUM('local', 's3') DEFAULT 'local',
        originalFilename VARCHAR(255) NOT NULL,
        storedPath VARCHAR(500) NOT NULL,
        url VARCHAR(500) NOT NULL,
        mimeType VARCHAR(100) NOT NULL,
        fileSize INT NOT NULL,
        dimensions JSON,
        isOptimized BOOLEAN DEFAULT FALSE,
        sortOrder INT DEFAULT 0,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (tenantId) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (propertyId) REFERENCES properties(id) ON DELETE SET NULL,
        INDEX idx_tenant_property (tenantId, propertyId)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await queryRunner.query(`
      CREATE TABLE tenant_storage_configs (
        id INT PRIMARY KEY AUTO_INCREMENT,
        tenantId INT NOT NULL UNIQUE,
        storageType ENUM('local', 's3') DEFAULT 'local',
        s3Bucket VARCHAR(255),
        s3Region VARCHAR(50),
        s3AccessKey VARCHAR(500),
        s3SecretKey VARCHAR(500),
        s3Endpoint VARCHAR(255),
        cdnUrl VARCHAR(255),
        maxFileSize INT DEFAULT 10,
        isActive BOOLEAN DEFAULT TRUE,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (tenantId) REFERENCES tenants(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // ============ FEED EXPORT TABLES ============
    await queryRunner.query(`
      CREATE TABLE feed_export_configs (
        id INT PRIMARY KEY AUTO_INCREMENT,
        tenantId INT NOT NULL UNIQUE,
        isEnabled BOOLEAN DEFAULT FALSE,
        exportKey VARCHAR(64) NOT NULL UNIQUE,
        allowedFormats JSON DEFAULT ('["xml", "json"]'),
        propertyFilter JSON,
        includeUnpublished BOOLEAN DEFAULT FALSE,
        includeSold BOOLEAN DEFAULT FALSE,
        xmlFormat ENUM('kyero', 'idealista', 'generic') DEFAULT 'kyero',
        cacheTtl INT DEFAULT 900,
        lastGeneratedAt TIMESTAMP NULL,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (tenantId) REFERENCES tenants(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await queryRunner.query(`
      CREATE TABLE feed_export_logs (
        id INT PRIMARY KEY AUTO_INCREMENT,
        tenantId INT NOT NULL,
        format ENUM('xml', 'json') NOT NULL,
        propertiesCount INT DEFAULT 0,
        requesterIp VARCHAR(45),
        userAgent VARCHAR(500),
        responseTimeMs INT,
        accessedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (tenantId) REFERENCES tenants(id) ON DELETE CASCADE,
        INDEX idx_tenant_date (tenantId, accessedAt)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // ============ MIGRATION JOBS TABLE ============
    await queryRunner.query(`
      CREATE TABLE migration_jobs (
        id INT PRIMARY KEY AUTO_INCREMENT,
        tenantId INT NOT NULL,
        userId INT NOT NULL,
        type ENUM('full', 'properties_only', 'settings_only') DEFAULT 'full',
        sourceFormat ENUM('csv', 'json') NOT NULL,
        status ENUM('pending', 'processing', 'completed', 'failed', 'cancelled') DEFAULT 'pending',
        progress INT DEFAULT 0,
        currentStep VARCHAR(255),
        filePath VARCHAR(500) NOT NULL,
        stats JSON,
        errors JSON,
        startedAt TIMESTAMP NULL,
        completedAt TIMESTAMP NULL,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (tenantId) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_tenant_status (tenantId, status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop tables in reverse order of creation
    await queryRunner.query(`DROP TABLE IF EXISTS migration_jobs`);
    await queryRunner.query(`DROP TABLE IF EXISTS feed_export_logs`);
    await queryRunner.query(`DROP TABLE IF EXISTS feed_export_configs`);
    await queryRunner.query(`DROP TABLE IF EXISTS tenant_storage_configs`);
    await queryRunner.query(`DROP TABLE IF EXISTS media_files`);
    await queryRunner.query(`DROP TABLE IF EXISTS email_sends`);
    await queryRunner.query(`DROP TABLE IF EXISTS email_campaigns`);
    await queryRunner.query(`DROP TABLE IF EXISTS email_templates`);
    await queryRunner.query(`DROP TABLE IF EXISTS tenant_email_configs`);
    await queryRunner.query(`DROP TABLE IF EXISTS saved_searches`);
    await queryRunner.query(`DROP TABLE IF EXISTS favorites`);
    await queryRunner.query(`DROP TABLE IF EXISTS search_logs`);
    await queryRunner.query(`DROP TABLE IF EXISTS property_views`);
    await queryRunner.query(`DROP TABLE IF EXISTS lead_activities`);
    await queryRunner.query(`DROP TABLE IF EXISTS leads`);
    await queryRunner.query(`DROP TABLE IF EXISTS contacts`);
    await queryRunner.query(`DROP TABLE IF EXISTS ticket_messages`);
    await queryRunner.query(`DROP TABLE IF EXISTS tickets`);
  }
}
