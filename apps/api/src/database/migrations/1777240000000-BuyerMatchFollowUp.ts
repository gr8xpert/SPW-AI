import { MigrationInterface, QueryRunner } from 'typeorm';

// Buyer Match, milestone A2: tasks, files and buyer questions.
// Questions are seeded per tenant on first use (BuyerQuestionService), not
// here, so tenants created later get them too.
export class BuyerMatchFollowUp1777240000000 implements MigrationInterface {
  name = 'BuyerMatchFollowUp1777240000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('buyer_tasks'))) {
      await queryRunner.query(`
        CREATE TABLE buyer_tasks (
          id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
          tenantId INT NOT NULL,
          leadId INT NOT NULL,
          title VARCHAR(255) NOT NULL,
          notes TEXT NULL,
          assignedTo INT NULL,
          dueAt DATETIME NULL,
          doneAt DATETIME NULL,
          createdBy INT NULL,
          createdAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          updatedAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
          INDEX idx_buyer_tasks_due (tenantId, assignedTo, doneAt, dueAt),
          INDEX IDX_buyer_tasks_lead (leadId),
          CONSTRAINT FK_buyer_tasks_tenant FOREIGN KEY (tenantId) REFERENCES tenants(id) ON DELETE CASCADE,
          CONSTRAINT FK_buyer_tasks_lead FOREIGN KEY (leadId) REFERENCES leads(id) ON DELETE CASCADE,
          CONSTRAINT FK_buyer_tasks_assignee FOREIGN KEY (assignedTo) REFERENCES users(id) ON DELETE SET NULL,
          CONSTRAINT FK_buyer_tasks_creator FOREIGN KEY (createdBy) REFERENCES users(id) ON DELETE SET NULL
        ) ENGINE=InnoDB`);
    }

    if (!(await queryRunner.hasTable('lead_files'))) {
      await queryRunner.query(`
        CREATE TABLE lead_files (
          id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
          tenantId INT NOT NULL,
          leadId INT NOT NULL,
          mediaFileId INT NULL,
          name VARCHAR(255) NOT NULL,
          mimeType VARCHAR(100) NOT NULL,
          size INT NOT NULL DEFAULT 0,
          url VARCHAR(1000) NOT NULL,
          uploadedBy INT NULL,
          createdAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          INDEX IDX_lead_files_lead (leadId),
          CONSTRAINT FK_lead_files_tenant FOREIGN KEY (tenantId) REFERENCES tenants(id) ON DELETE CASCADE,
          CONSTRAINT FK_lead_files_lead FOREIGN KEY (leadId) REFERENCES leads(id) ON DELETE CASCADE,
          CONSTRAINT FK_lead_files_uploader FOREIGN KEY (uploadedBy) REFERENCES users(id) ON DELETE SET NULL
        ) ENGINE=InnoDB`);
    }

    if (!(await queryRunner.hasTable('buyer_questions'))) {
      await queryRunner.query(`
        CREATE TABLE buyer_questions (
          id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
          tenantId INT NOT NULL,
          qkey VARCHAR(60) NOT NULL,
          label JSON NOT NULL,
          options JSON NOT NULL,
          multiple TINYINT NOT NULL DEFAULT 0,
          showOnForm TINYINT NOT NULL DEFAULT 1,
          isActive TINYINT NOT NULL DEFAULT 1,
          sortOrder INT NOT NULL DEFAULT 0,
          createdAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          UNIQUE INDEX uq_buyer_questions_key (tenantId, qkey),
          CONSTRAINT FK_buyer_questions_tenant FOREIGN KEY (tenantId) REFERENCES tenants(id) ON DELETE CASCADE
        ) ENGINE=InnoDB`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS buyer_questions');
    await queryRunner.query('DROP TABLE IF EXISTS lead_files');
    await queryRunner.query('DROP TABLE IF EXISTS buyer_tasks');
  }
}
