import { MigrationInterface, QueryRunner } from 'typeorm';

// AI email designer (2026-10-23): template versions, designer chat, brand
// memory and the email image library.
export class EmailDesigner1777410000000 implements MigrationInterface {
  name = 'EmailDesigner1777410000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('email_template_versions'))) {
      await queryRunner.query(`CREATE TABLE email_template_versions (
        id INT NOT NULL AUTO_INCREMENT,
        tenantId INT NOT NULL,
        templateId INT NOT NULL,
        bodyHtml MEDIUMTEXT NOT NULL,
        subject VARCHAR(255) NOT NULL,
        source ENUM('ai','manual','restore','layout') NOT NULL,
        createdAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        INDEX IDX_etv_template (templateId, id),
        CONSTRAINT FK_etv_tenant FOREIGN KEY (tenantId) REFERENCES tenants(id) ON DELETE CASCADE,
        CONSTRAINT FK_etv_template FOREIGN KEY (templateId) REFERENCES email_templates(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    }
    if (!(await queryRunner.hasTable('email_template_ai_messages'))) {
      await queryRunner.query(`CREATE TABLE email_template_ai_messages (
        id INT NOT NULL AUTO_INCREMENT,
        tenantId INT NOT NULL,
        templateId INT NOT NULL,
        role ENUM('user','assistant') NOT NULL,
        content TEXT NOT NULL,
        versionId INT NULL,
        createdAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        INDEX IDX_etam_template (templateId, id),
        CONSTRAINT FK_etam_tenant FOREIGN KEY (tenantId) REFERENCES tenants(id) ON DELETE CASCADE,
        CONSTRAINT FK_etam_template FOREIGN KEY (templateId) REFERENCES email_templates(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    }
    if (!(await queryRunner.hasTable('tenant_brand_memory'))) {
      await queryRunner.query(`CREATE TABLE tenant_brand_memory (
        tenantId INT NOT NULL,
        notes JSON NOT NULL,
        updatedAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (tenantId),
        CONSTRAINT FK_tbm_tenant FOREIGN KEY (tenantId) REFERENCES tenants(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    }
    if (!(await queryRunner.hasTable('email_images'))) {
      await queryRunner.query(`CREATE TABLE email_images (
        id INT NOT NULL AUTO_INCREMENT,
        tenantId INT NOT NULL,
        contentHash VARCHAR(64) NOT NULL,
        url VARCHAR(500) NOT NULL,
        mimeType VARCHAR(100) NOT NULL,
        width INT NOT NULL,
        height INT NOT NULL,
        bytes INT NOT NULL,
        pinned TINYINT NOT NULL DEFAULT 0,
        lastUsedAt TIMESTAMP NULL DEFAULT NULL,
        createdAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        UNIQUE INDEX UQ_email_images_hash (tenantId, contentHash),
        CONSTRAINT FK_ei_tenant FOREIGN KEY (tenantId) REFERENCES tenants(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const t of ['email_images', 'tenant_brand_memory', 'email_template_ai_messages', 'email_template_versions']) {
      if (await queryRunner.hasTable(t)) await queryRunner.query(`DROP TABLE ${t}`);
    }
  }
}
